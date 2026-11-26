import type { Tx } from "~/db.server";
import type { ILogger } from "~/shared/logging/ILogger";
import type { ITransactionRunner } from "~/shared/persistence/ITransactionRunner";
import { DomainError } from "~/shared/errors";
import type { ApplyImportedWorkflowStatusUseCase } from "~/domains/validation-workflow/application/use-cases/ApplyImportedWorkflowStatus";
import type { GetWorkflowInstanceByEntityUseCase } from "~/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity";
import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { ISpecificHazardTaxonomyRepository } from "../ports/ISpecificHazardTaxonomyRepository";
import type { HazardousEventExportRow } from "../dto/HazardousEventExportRow";
import {
	MAX_REPORTED_CSV_ERRORS,
	type HazardousEventCsvFileError,
	type HazardousEventCsvImportMode,
	type HazardousEventCsvImportResult,
	type HazardousEventCsvRowError,
} from "../dto/HazardousEventCsvImportResult";
import { checkHeader, isCsvImportMode } from "../csv/hazardousEventCsvColumns";
import {
	collectSourceRefs,
	mapCsvRows,
	type MappedCsvRow,
} from "../csv/mapCsvRowToCommand";
import {
	changedColumns,
	checkCreatePathRow,
	checkUpdateRow,
	planUpdateRow,
	rowErrorForDomainError,
	toCreateCommand,
	toUpdateCommand,
	type CsvCommandContext,
} from "../csv/importRowPolicy";
import type { CreateHazardousEventUseCase } from "./CreateHazardousEvent";
import type { UpdateHazardousEventUseCase } from "./UpdateHazardousEvent";

export interface ImportHazardousEventsCsvCommand {
	tenantId: string;
	actingUserId: string;
	role: string | null;
	/** Raw posted mode; anything but create/update/upsert gives `invalid_mode`. */
	mode: string;
	header: readonly string[];
	rows: readonly (readonly string[])[];
	/** Physical line of `rows[0]` (D1). */
	firstDataLine: number;
	/** Physical start line of each row, when the parser knows it. */
	lineNumbers?: readonly number[];
}

/** Stops the row loop so `transactionRunner.run` rolls the whole file back (D4 step 3). */
class CsvRowRejected extends Error {
	constructor(readonly rowError: HazardousEventCsvRowError) {
		super("CSV row rejected");
	}
}

type Counts = { created: number; updated: number; unchanged: number };

type RejectedResult = Extract<HazardousEventCsvImportResult, { ok: false }>;

const MAX_ECHOED_COLUMN_LENGTH = 100;

/** A header cell is echoed as `column`; a huge one must not travel back in full. */
function truncateColumn<T extends { column?: string }>(error: T): T {
	return error.column === undefined ||
		error.column.length <= MAX_ECHOED_COLUMN_LENGTH
		? error
		: { ...error, column: error.column.slice(0, MAX_ECHOED_COLUMN_LENGTH) };
}

/** Imports a parsed CSV for the session tenant, all or nothing (D1, D2, D4). Row and file
 * problems are returned as data (OD-6); only non-DomainErrors propagate (ADR-003 Rule 4). */
export class ImportHazardousEventsCsvUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly hazardousEventRepository: Pick<
			IHazardousEventRepository,
			"findIdByApiImportId" | "findExportRows"
		>,
		private readonly taxonomyRepository: Pick<
			ISpecificHazardTaxonomyRepository,
			"findBySourceRefIds"
		>,
		private readonly createHazardousEventUseCase: Pick<
			CreateHazardousEventUseCase,
			"execute"
		>,
		private readonly updateHazardousEventUseCase: Pick<
			UpdateHazardousEventUseCase,
			"execute"
		>,
		private readonly applyImportedWorkflowStatusUseCase: Pick<
			ApplyImportedWorkflowStatusUseCase,
			"execute"
		>,
		private readonly getWorkflowInstanceByEntityUseCase: Pick<
			GetWorkflowInstanceByEntityUseCase,
			"execute"
		>,
		private readonly transactionRunner: ITransactionRunner,
	) {}

	async execute(
		command: ImportHazardousEventsCsvCommand,
	): Promise<HazardousEventCsvImportResult> {
		if (!isCsvImportMode(command.mode)) {
			return this.rejected(command.tenantId, null, {
				fileErrors: [{ code: "invalid_mode" }],
			});
		}
		const mode = command.mode;
		if (command.rows.length === 0) {
			return this.rejected(command.tenantId, mode, {
				fileErrors: [{ code: "no_data" }],
			});
		}
		const header = checkHeader(command.header, mode);
		if (!header.ok) {
			return this.rejected(command.tenantId, mode, header);
		}

		// The only pre-transaction read: one taxonomy lookup for every row (D13).
		const lookup = await this.taxonomyRepository.findBySourceRefIds(
			collectSourceRefs(header.columns, command.rows),
		);
		const mapped = mapCsvRows({
			mode,
			columns: header.columns,
			notYetImportedIndexes: header.notYetImportedIndexes,
			rows: command.rows,
			firstDataLine: command.firstDataLine,
			lineNumbers: command.lineNumbers,
			role: command.role,
			lookup,
		});
		if (mapped.errors.length > 0) {
			return this.rejected(command.tenantId, mode, {
				rowErrors: mapped.errors,
				ignoredColumns: header.ignoredColumns,
			});
		}

		let counts: Counts;
		try {
			counts = await this.transactionRunner.run((tx) =>
				this.writeRows(command, mode, mapped.rows, tx),
			);
		} catch (err) {
			if (!(err instanceof CsvRowRejected)) {
				throw err;
			}
			return this.rejected(command.tenantId, mode, {
				rowErrors: [err.rowError],
				ignoredColumns: header.ignoredColumns,
			});
		}

		this.logger.info({
			msg: "hazardous_events.csv_imported",
			tenantId: command.tenantId,
			mode,
			...counts,
		});
		const skippedRows = mapped.rows.filter(
			(row) => row.hasNotYetImportedData,
		).length;
		return {
			ok: true,
			mode,
			...counts,
			ignoredColumns: header.ignoredColumns,
			...(skippedRows > 0 ? { skippedDataNotice: { rows: skippedRows } } : {}),
		};
	}

	/** An upload the presentation layer could not read as CSV; logged like every rejection. */
	rejectUpload(args: {
		tenantId: string;
		mode: string;
		fileError: HazardousEventCsvFileError;
	}): HazardousEventCsvImportResult {
		return this.rejected(
			args.tenantId,
			isCsvImportMode(args.mode) ? args.mode : null,
			{ fileErrors: [args.fileError] },
		);
	}

	private rejected(
		tenantId: string,
		mode: HazardousEventCsvImportMode | null,
		errors: Partial<
			Pick<RejectedResult, "fileErrors" | "rowErrors" | "ignoredColumns">
		>,
	): RejectedResult {
		const fileErrors = errors.fileErrors ?? [];
		const rowErrors = errors.rowErrors ?? [];
		this.logger.info({
			msg: "hazardous_events.csv_import_rejected",
			tenantId,
			mode,
			fileErrorCount: fileErrors.length,
			rowErrorCount: rowErrors.length,
		});
		const reportedFileErrors = fileErrors
			.slice(0, MAX_REPORTED_CSV_ERRORS)
			.map(truncateColumn);
		return {
			ok: false,
			mode,
			fileErrors: reportedFileErrors,
			rowErrors: rowErrors
				.slice(0, MAX_REPORTED_CSV_ERRORS - reportedFileErrors.length)
				.map(truncateColumn),
			errorCount: fileErrors.length + rowErrors.length,
			ignoredColumns: errors.ignoredColumns ?? [],
		};
	}

	/** Rows run one after another: one transaction cannot run statements in parallel. */
	private async writeRows(
		command: ImportHazardousEventsCsvCommand,
		mode: HazardousEventCsvImportMode,
		rows: readonly MappedCsvRow[],
		tx: Tx,
	): Promise<Counts> {
		const counts: Counts = { created: 0, updated: 0, unchanged: 0 };
		const context: CsvCommandContext = {
			tenantId: command.tenantId,
			actingUserId: command.actingUserId,
			tx,
		};
		// Read once in the import's transaction; a matched row always pre-exists the file (D14).
		const existingById =
			mode === "create"
				? new Map<string, HazardousEventExportRow>()
				: new Map(
						(
							await this.hazardousEventRepository.findExportRows(
								command.tenantId,
								tx,
							)
						).map((row) => [row.id, row]),
					);

		for (const row of rows) {
			try {
				const outcome = await this.writeRow(
					command,
					mode,
					row,
					existingById,
					context,
				);
				counts[outcome] += 1;
			} catch (err) {
				if (err instanceof DomainError) {
					throw new CsvRowRejected({
						line: row.line,
						...rowErrorForDomainError(err, row),
					});
				}
				throw err;
			}
		}
		return counts;
	}

	private async writeRow(
		command: ImportHazardousEventsCsvCommand,
		mode: HazardousEventCsvImportMode,
		row: MappedCsvRow,
		existingById: ReadonlyMap<string, HazardousEventExportRow>,
		context: CsvCommandContext,
	): Promise<keyof Counts> {
		if (mode === "create") {
			return this.createRow(command, row, context);
		}
		if (mode === "update") {
			const existing = existingById.get(row.id ?? "");
			if (existing === undefined) {
				throw new CsvRowRejected({
					line: row.line,
					code: "not_found",
					column: "id",
				});
			}
			return this.updateRow(command, row, existing, context);
		}
		const existingId = await this.hazardousEventRepository.findIdByApiImportId(
			row.apiImportId ?? "",
			command.tenantId,
			context.tx,
		);
		if (existingId === null) {
			const ruleError = checkCreatePathRow(row, command.role);
			if (ruleError !== null) {
				throw new CsvRowRejected(ruleError);
			}
			return this.createRow(command, row, context);
		}
		const existing = existingById.get(existingId);
		if (existing === undefined) {
			// Committed by another import after this file's snapshot: the loser reports conflict.
			throw new CsvRowRejected({
				line: row.line,
				code: "conflict",
				column: "apiImportId",
			});
		}
		return this.updateRow(command, row, existing, context);
	}

	private async createRow(
		command: ImportHazardousEventsCsvCommand,
		row: MappedCsvRow,
		context: CsvCommandContext,
	): Promise<"created"> {
		const created = await this.createHazardousEventUseCase.execute(
			toCreateCommand(row, context),
		);
		if (row.targetStatus !== undefined && row.targetStatus !== "DRAFT") {
			await this.applyStatus(command, created.id, row, context.tx);
		}
		return "created";
	}

	private async updateRow(
		command: ImportHazardousEventsCsvCommand,
		row: MappedCsvRow,
		existing: HazardousEventExportRow,
		context: CsvCommandContext,
	): Promise<"updated" | "unchanged"> {
		const changed = changedColumns(row, existing);
		if (changed.length === 0) {
			return "unchanged";
		}
		const plan = planUpdateRow(changed);
		// Re-read in this transaction: the snapshot may predate a publish made during the import.
		const workflow = await this.getWorkflowInstanceByEntityUseCase.execute({
			entityId: existing.id,
			entityType: "HE",
			tx: context.tx,
		});
		const ruleError = checkUpdateRow({
			row,
			existing,
			plan,
			role: command.role,
			workflowStatus: workflow?.status ?? null,
		});
		if (ruleError !== null) {
			throw new CsvRowRejected(ruleError);
		}
		if (plan.fieldsChanged) {
			await this.updateHazardousEventUseCase.execute(
				toUpdateCommand(row, existing.id, changed, context),
			);
		}
		if (plan.statusChanged) {
			await this.applyStatus(command, existing.id, row, context.tx);
		}
		return "updated";
	}

	private async applyStatus(
		command: ImportHazardousEventsCsvCommand,
		entityId: string,
		row: MappedCsvRow,
		tx: Tx,
	): Promise<void> {
		if (row.targetStatus === undefined) {
			return;
		}
		await this.applyImportedWorkflowStatusUseCase.execute({
			entityId,
			entityType: "HE",
			tenantId: command.tenantId,
			targetStatus: row.targetStatus,
			actingUserId: command.actingUserId,
			actingUserRole: command.role,
			tx,
		});
	}
}
