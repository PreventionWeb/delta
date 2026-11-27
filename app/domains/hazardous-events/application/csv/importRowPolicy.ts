import type { Tx } from "~/db.server";
import {
	AuthorizationError,
	ConcurrentModificationError,
	ConflictError,
	type DomainError,
	NotFoundError,
	ValidationError,
} from "~/shared/errors";
import {
	STATUS_CHANGE_NOT_SUPPORTED,
	WorkflowInstanceNotFoundError,
} from "~/domains/validation-workflow/application/errors/WorkflowInstanceErrors";
import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";
import { causalConflictKind } from "../causalConflictKind";
import type { HazardousEventAttachmentInput } from "../dto/HazardousEventAttachmentInput";
import {
	MAX_ECHOED_CSV_VALUE_LENGTH,
	type HazardousEventCsvRowError,
} from "../dto/HazardousEventCsvImportResult";
import type { HazardousEventExportRow } from "../dto/HazardousEventExportRow";
import {
	canImportNonDraftStatus,
	isStatusAwareEditBlocked,
} from "../editPolicy";
import { API_IMPORT_ID_CONFLICT } from "../ports/IHazardousEventRepository";
import type { CreateHazardousEventCommand } from "../use-cases/CreateHazardousEvent";
import type { UpdateHazardousEventCommand } from "../use-cases/UpdateHazardousEvent";
import { legacyApprovalStatusToStatus } from "./approvalStatusMapping";
import { exportRowCells } from "./exportRowCells";
import {
	CREATE_PATH_REQUIRED_COLUMNS,
	MAPPED_COLUMNS,
	type MappedColumn,
} from "./hazardousEventCsvColumns";
import type { MappedCsvRow } from "./mapCsvRowToCommand";
import {
	spatialFootprintEquals,
	type CsvSpatialFootprint,
} from "./spatialFootprintCsv";
import { attachmentsEqual, toAttachmentInputs } from "./attachmentsCsv";

// Everything decided about one mapped CSV row on update/upsert/create, in pipeline order:
// change detection, rule checks, error-to-row-code mapping, then command building.
// --- Change detection (NOD-4) ---

const HAZARD_COLUMNS: ReadonlySet<MappedColumn> = new Set([
	"hipHazardId",
	"hipClusterId",
	"hipTypeId",
	"specificHazardId",
]);

/** Empty and `draft` both mean DRAFT, so a draft row compares equal either way. A JSON cell
 * compares by content, and an empty one is not supplied (D6, OD-2). */
function cellEquals(column: string, value: string, exported: string): boolean {
	if (column === "approvalStatus") {
		return (
			legacyApprovalStatusToStatus(value) ===
			legacyApprovalStatusToStatus(exported)
		);
	}
	if (column === "spatialFootprint") {
		return value === "" || spatialFootprintEquals(value, exported);
	}
	if (column === "attachments") {
		return value === "" || attachmentsEqual(value, exported);
	}
	return value === exported;
}

const HAZARD_ID_COLUMNS: ReadonlySet<MappedColumn> = new Set([
	"hipHazardId",
	"specificHazardId",
]);

/** Cluster/type cells alone never pick a hazard, so they count only beside a hazard cell. */
function suppliedHazardCellDiffers(
	row: MappedCsvRow,
	exported: Readonly<Record<string, string>>,
): boolean {
	const namesHazard = [...row.cells].some(
		([column, value]) => HAZARD_ID_COLUMNS.has(column) && value !== "",
	);
	return (
		namesHazard &&
		[...row.cells].some(
			([column, value]) =>
				HAZARD_COLUMNS.has(column) &&
				value !== "" &&
				value !== exported[column],
		)
	);
}

/** A resolved hazard compares by id, so partial hazard cells are no change. An unresolved one
 * (error deferred, or an unmigrated row) compares its supplied cells, so a failed edit surfaces. */
function hazardChanged(
	row: MappedCsvRow,
	existing: HazardousEventExportRow,
	exported: Readonly<Record<string, string>>,
): boolean {
	if (
		existing.specificHazardId !== null &&
		row.specificHazardId !== undefined
	) {
		return row.specificHazardId !== existing.specificHazardId;
	}
	return suppliedHazardCellDiffers(row, exported);
}

/** Columns whose supplied value differs from what the export writes today (NOD-4). A hazard
 * change is reported as `specificHazardId`. */
export function changedColumns(
	row: MappedCsvRow,
	existing: HazardousEventExportRow,
): string[] {
	const exported = exportRowCells(existing);
	const changed = [...row.cells]
		.filter(
			([column, value]) =>
				!HAZARD_COLUMNS.has(column) &&
				!cellEquals(column, value, exported[column]),
		)
		.map(([column]) => column);
	if (hazardChanged(row, existing, exported)) {
		changed.push("specificHazardId");
	}
	return changed;
}

// --- Row rules (D4 step 2, NOD-2, NOD-6) ---

type RowErrorCode = HazardousEventCsvRowError["code"];

function rowError(
	line: number,
	code: RowErrorCode,
	column?: string,
	value?: string,
): HazardousEventCsvRowError {
	return {
		line,
		code,
		...(column !== undefined ? { column } : {}),
		...(value !== undefined
			? { value: value.slice(0, MAX_ECHOED_CSV_VALUE_LENGTH) }
			: {}),
	};
}

const NO_FILES: ReadonlySet<string> = new Set();

/** Attachment inputs for a row taking the create path: a new event holds no files (D5). */
export function createPathAttachmentInputs(
	row: Pick<MappedCsvRow, "line" | "attachments">,
): ReturnType<typeof rowAttachmentInputs> {
	return rowAttachmentInputs(row, NO_FILES);
}

/** Keys of the File attachments the event holds in CA today, never the legacy jsonb (D5). */
export function heldFileKeys(
	existing: HazardousEventExportRow,
): ReadonlySet<string> {
	return new Set(
		existing.attachments
			.filter((attachment) => attachment.type === "File")
			.map((attachment) => attachment.fileKey)
			.filter((fileKey): fileKey is string => fileKey !== null),
	);
}

/** The row's attachment inputs, or its URL or File-reference error (D5, D12). `inputs` is
 * `undefined` when the row supplies no attachments. */
export function rowAttachmentInputs(
	row: Pick<MappedCsvRow, "line" | "attachments">,
	fileKeys: ReadonlySet<string>,
):
	| { ok: true; inputs: HazardousEventAttachmentInput[] | undefined }
	| { ok: false; error: HazardousEventCsvRowError } {
	if (row.attachments === undefined) return { ok: true, inputs: undefined };
	const result = toAttachmentInputs(row.attachments, fileKeys);
	return result.ok
		? { ok: true, inputs: result.inputs }
		: {
				ok: false,
				error: rowError(row.line, result.code, "attachments", result.value),
			};
}

/** An empty required cell is missing; on the create path an absent column is too, while an
 * update leaves an absent column unchanged. */
export function requiredCellErrors(
	row: Pick<MappedCsvRow, "line" | "cells">,
	options: { absentIsEmpty: boolean },
): HazardousEventCsvRowError[] {
	return CREATE_PATH_REQUIRED_COLUMNS.filter((column) => {
		const value = row.cells.get(column);
		return value === undefined ? options.absentIsEmpty : value === "";
	}).map((column) => rowError(row.line, "required", column));
}

/** Required cells and hazard for a row taking the create path (D3, NOD-6, NOD-2). */
export function createPathErrors(
	row: MappedCsvRow,
	role: string | null,
): HazardousEventCsvRowError[] {
	const errors = requiredCellErrors(row, { absentIsEmpty: true });
	if (row.specificHazardId === undefined) {
		errors.push(rowError(row.line, "specific_hazard_required"));
	}
	if (
		row.targetStatus !== undefined &&
		row.targetStatus !== "DRAFT" &&
		!canImportNonDraftStatus(role)
	) {
		errors.push(rowError(row.line, "status_not_permitted", "approvalStatus"));
	}
	return errors;
}

/** What a changed update or upsert-match row will write. */
export interface UpdateRowPlan {
	fieldsChanged: boolean;
	statusChanged: boolean;
	parentChanged: boolean;
	footprintChanged: boolean;
}

export function planUpdateRow(changed: readonly string[]): UpdateRowPlan {
	return {
		fieldsChanged: changed.some((column) => column !== "approvalStatus"),
		statusChanged: changed.includes("approvalStatus"),
		parentChanged: changed.includes("parent"),
		footprintChanged: changed.includes("spatialFootprint"),
	};
}

/** OD-9: a current observation dated after the import stays current and would hide the import's. */
function observationIsLater(
	existing: HazardousEventExportRow,
	importTime: Date,
): boolean {
	const time = existing.currentObservation?.observationTime;
	return time !== undefined && time.getTime() > importTime.getTime();
}

/** D4 step 2 order after the unchanged skip (NOD-4). `workflowStatus` must come from a read
 * inside the import transaction, not the start-of-file snapshot. */
export function checkUpdateRow(args: {
	row: MappedCsvRow;
	existing: HazardousEventExportRow;
	plan: UpdateRowPlan;
	role: string | null;
	workflowStatus: Status | null;
	importTime: Date;
}): HazardousEventCsvRowError | null {
	const { row, existing, plan, role, workflowStatus } = args;
	const reject = (code: RowErrorCode, column?: string) =>
		rowError(row.line, code, column);
	if (existing.specificHazardId === null) {
		return reject("not_migrated");
	}
	if (row.deferredErrors.length > 0) {
		return row.deferredErrors[0];
	}
	if (
		row.apiImportId !== undefined &&
		row.apiImportId !== existing.apiImportId
	) {
		return reject("api_import_id_immutable", "apiImportId");
	}
	if (plan.fieldsChanged && isStatusAwareEditBlocked(role, workflowStatus)) {
		return reject("not_editable");
	}
	// Export shows one cause; replacing would silently drop the others (user decision, N4).
	if (plan.parentChanged && existing.causeCount > 1) {
		return reject("parent_multiple_causes", "parent");
	}
	if (
		plan.statusChanged &&
		row.targetStatus !== "DRAFT" &&
		!canImportNonDraftStatus(role)
	) {
		return reject("status_not_permitted", "approvalStatus");
	}
	if (plan.footprintChanged && observationIsLater(existing, args.importTime)) {
		return reject("conflict", "spatialFootprint");
	}
	return null;
}

/** A create-path row's first rule error (deferred errors, then attachment errors, then the
 * create-path rules), or the attachment inputs to create it with (D3, D5). */
export function planCreatePathRow(
	row: MappedCsvRow,
	role: string | null,
):
	| { ok: true; attachments: HazardousEventAttachmentInput[] }
	| { ok: false; error: HazardousEventCsvRowError } {
	const [deferred] = row.deferredErrors;
	if (deferred !== undefined) return { ok: false, error: deferred };
	const attachments = createPathAttachmentInputs(row);
	if (!attachments.ok) return { ok: false, error: attachments.error };
	const [createError] = createPathErrors(row, role);
	if (createError !== undefined) return { ok: false, error: createError };
	return { ok: true, attachments: attachments.inputs ?? [] };
}

export function checkCreatePathRow(
	row: MappedCsvRow,
	role: string | null,
): HazardousEventCsvRowError | null {
	const plan = planCreatePathRow(row, role);
	return plan.ok ? null : plan.error;
}

// --- DomainError to row code (D6, SF-1) ---

const CSV_COLUMNS: ReadonlySet<string> = new Set<string>([
	...MAPPED_COLUMNS,
	"id",
]);

type RowCode = Pick<HazardousEventCsvRowError, "code" | "column">;

function conflictCode(err: ConflictError): RowCode {
	if (err.context?.reason === STATUS_CHANGE_NOT_SUPPORTED) {
		return { code: "status_change_not_supported", column: "approvalStatus" };
	}
	if (err.context?.reason === API_IMPORT_ID_CONFLICT) {
		return { code: "conflict", column: "apiImportId" };
	}
	const causal = causalConflictKind(err);
	if (causal === "cause_after_effect") {
		return { code: "cause_after_effect", column: "parent" };
	}
	return causal === "cycle"
		? { code: "conflict", column: "parent" }
		: { code: "conflict" };
}

/** D6: a DomainError a row's write raised, as its row code. Subclasses are checked first. */
export function rowErrorForDomainError(
	err: DomainError,
	row: Pick<MappedCsvRow, "id" | "causeId">,
): RowCode {
	if (err instanceof AuthorizationError) {
		return { code: "status_not_permitted", column: "approvalStatus" };
	}
	if (err instanceof ConcurrentModificationError) {
		return { code: "concurrent_modification" };
	}
	if (err instanceof WorkflowInstanceNotFoundError) {
		return { code: "status_change_not_supported", column: "approvalStatus" };
	}
	if (err instanceof ConflictError) {
		return conflictCode(err);
	}
	if (err instanceof NotFoundError) {
		if (row.causeId !== undefined && err.context?.id === row.causeId) {
			return { code: "not_found", column: "parent" };
		}
		return {
			code: "not_found",
			column: row.id !== undefined ? "id" : undefined,
		};
	}
	if (err instanceof ValidationError) {
		const field = err.context?.field;
		return typeof field === "string" && CSV_COLUMNS.has(field)
			? { code: "validation", column: field }
			: { code: "validation" };
	}
	return { code: "validation" };
}

// --- Command building ---

/** Session-derived context every command carries; `tx` is the import's open transaction. */
export interface CsvCommandContext {
	tenantId: string;
	actingUserId: string;
	tx: Tx;
	/** One instant per file, so every row's observation shares it (D3). */
	importTime: Date;
}

function toSpatialObservation(
	footprint: CsvSpatialFootprint,
	context: CsvCommandContext,
) {
	return {
		geometries: footprint.geometries,
		divisionIds: footprint.divisionIds,
		observationTime: context.importTime,
	};
}

function isEmptyFootprint(footprint: CsvSpatialFootprint): boolean {
	return (
		footprint.geometries.length === 0 && footprint.divisionIds.length === 0
	);
}

/** Create command for a create-path row; `createPathErrors` guarantees the hazard (D3). */
export function toCreateCommand(
	row: MappedCsvRow,
	context: CsvCommandContext,
	attachments: readonly HazardousEventAttachmentInput[] = [],
): CreateHazardousEventCommand {
	const { fields } = row;
	return {
		tenantId: context.tenantId,
		specificHazardId: row.specificHazardId ?? "",
		startDate: fields.startDate ?? "",
		endDate: fields.endDate ?? "",
		nationalSpecification: fields.nationalSpecification ?? "",
		description: fields.description ?? "",
		chainsExplanation: fields.chainsExplanation ?? "",
		magnitude: fields.magnitude ?? "",
		recordOriginator: fields.recordOriginator ?? "",
		dataSource: fields.dataSource ?? "",
		hazardousEventStatus: fields.hazardousEventStatus ?? null,
		specificHazardLocalName: fields.specificHazardLocalName ?? null,
		specificHazardNationalName: fields.specificHazardNationalName ?? null,
		apiImportId: row.apiImportId ?? null,
		actingUserId: context.actingUserId,
		hazardDriverIds: [],
		attachments,
		fieldValues: [],
		customFieldValues: [],
		...(row.causeId ? { causeId: row.causeId } : {}),
		// `[]` on the create path records nothing (D3).
		...(row.spatialFootprint !== undefined &&
		!isEmptyFootprint(row.spatialFootprint)
			? {
					spatialObservation: toSpatialObservation(
						row.spatialFootprint,
						context,
					),
				}
			: {}),
		tx: context.tx,
	};
}

/** Update command with only the supplied fields; the cause only when `parent` changed, so an
 * unchanged link keeps its explanation. */
export function toUpdateCommand(
	row: MappedCsvRow,
	existingId: string,
	changed: readonly string[],
	context: CsvCommandContext,
	options: {
		attachments?: readonly HazardousEventAttachmentInput[];
		/** The projection's `updatedAt`, so a change made since that read is rejected. */
		expectedUpdatedAt?: Date | null;
	} = {},
): UpdateHazardousEventCommand {
	const { attachments, expectedUpdatedAt } = options;
	return {
		id: existingId,
		tenantId: context.tenantId,
		actingUserId: context.actingUserId,
		...row.fields,
		...(row.specificHazardId !== undefined
			? { specificHazardId: row.specificHazardId }
			: {}),
		...(changed.includes("parent") && row.causeId !== undefined
			? { causeId: row.causeId }
			: {}),
		// A changed `[]` records an empty observation, which clears the footprint (NOD-8).
		...(changed.includes("spatialFootprint") &&
		row.spatialFootprint !== undefined
			? {
					spatialObservation: toSpatialObservation(
						row.spatialFootprint,
						context,
					),
				}
			: {}),
		// A present cell replaces the whole set, so `[]` clears it (NOD-7).
		...(changed.includes("attachments") && attachments !== undefined
			? { attachments }
			: {}),
		...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
		tx: context.tx,
	};
}
