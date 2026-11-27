// Shared real-adapter graph and seeders for the 6d CSV import/export PGlite suites.
// Callers must `import "../../db/setup"` before importing this module.
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import { dr } from "~/db.server";
import { auditLogsTable } from "~/drizzle/schema/auditLogsTable";
import { eventTable } from "~/drizzle/schema/eventTable";
import { eventRelationshipTable } from "~/drizzle/schema/eventRelationshipTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { hazardousEventGeomTable } from "~/drizzle/schema/hazardousEventGeomTable";
import { hazardousEventDivisionTable } from "~/drizzle/schema/hazardousEventDivisionTable";
import { hazardousEventSpatialObservationTable } from "~/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationTable";
import { DrizzleDivisionRepository } from "~/domains/hazardous-events/infrastructure/DrizzleDivisionRepository.server";
import { RecordSpatialObservationUseCase } from "~/domains/hazardous-events/application/use-cases/RecordSpatialObservation";
import { hazardousEventCausalityTable } from "~/domains/hazardous-events/infrastructure/hazardousEventCausalityTable";
import { workflowInstanceTable } from "~/domains/validation-workflow/infrastructure/workflowInstanceTable";
import { workflowNotificationTable } from "~/domains/validation-workflow/infrastructure/workflowNotificationTable";
import { DrizzleTransactionRunner } from "~/infrastructure/DrizzleTransactionRunner.server";
import { DrizzleHazardousEventRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server";
import { DrizzleCausalChainRepository } from "~/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server";
import { DrizzleHazardTaxonomyRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardTaxonomyRepository.server";
import { DrizzleSpecificHazardTaxonomyRepository } from "~/domains/hazardous-events/infrastructure/DrizzleSpecificHazardTaxonomyRepository.server";
import { DrizzleHipCrosswalkAdapter } from "~/domains/hazardous-events/infrastructure/DrizzleHipCrosswalkAdapter.server";
import { DrizzleWorkflowRepository } from "~/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server";
import { InitializeWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/InitializeWorkflowInstance";
import { GetWorkflowInstanceByEntityUseCase } from "~/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity";
import { ApplyImportedWorkflowStatusUseCase } from "~/domains/validation-workflow/application/use-cases/ApplyImportedWorkflowStatus";
import { WorkflowInstance } from "~/domains/validation-workflow/domain/WorkflowInstance";
import { CreateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/CreateHazardousEvent";
import { UpdateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent";
import { ImportHazardousEventsCsvUseCase } from "~/domains/hazardous-events/application/use-cases/ImportHazardousEventsCsv";
import { ExportHazardousEventsCsvUseCase } from "~/domains/hazardous-events/application/use-cases/ExportHazardousEventsCsv";
import type { HazardousEventCsvImportResult } from "~/domains/hazardous-events/application/dto/HazardousEventCsvImportResult";
import {
	HazardousEvent,
	type HazardousEventProps,
} from "~/domains/hazardous-events/domain/HazardousEvent";
import { serializeCsv } from "~/domains/hazardous-events/presentation/web/csv/serializeCsv";
import { LocalDiskAttachmentStorageAdapter } from "~/domains/shared/attachments/infrastructure/LocalDiskAttachmentStorageAdapter.server";
import { DrizzleAuditLogAdapter } from "~/domains/shared/audit-log/infrastructure/DrizzleAuditLogAdapter.server";
import type { ILogger } from "~/shared/logging/ILogger";
import type { ITransactionRunner } from "~/shared/persistence/ITransactionRunner";
import type { Tx } from "~/db.server";
import type {
	AttachmentDescriptor,
	IAttachmentStoragePort,
	PromoteResult,
	StagedFileReference,
} from "~/domains/shared/attachments/application/ports/IAttachmentStoragePort";
import { hazardousEventAttachmentTable } from "~/domains/hazardous-events/infrastructure/hazardousEventAttachmentTable";
import { HAZARDOUS_EVENT_ATTACHMENT_OWNER_TYPE } from "~/domains/hazardous-events/application/use-cases/deleteAttachmentFiles";
import {
	seedHipChain,
	seedSpecificHazard,
	seedUser,
} from "../../db/models/hazardousEventTestHelpers";

/** Legacy export header, literal from specs/hazardous-event-csv-export/spec.md (E1). */
export const E1_HEADER: readonly string[] = [
	"updatedAt",
	"createdAt",
	"approvalStatus",
	"createdByUserId",
	"updatedByUserId",
	"submittedByUserId",
	"submittedAt",
	"validatedByUserId",
	"validatedAt",
	"publishedByUserId",
	"publishedAt",
	"apiImportId",
	"hipHazardId",
	"hipClusterId",
	"hipTypeId",
	"id",
	"countryAccountsId",
	"specificHazardId",
	"status",
	"nationalSpecification",
	"startDate",
	"endDate",
	"description",
	"chainsExplanation",
	"magnitude",
	"recordOriginator",
	"hazardousEventStatus",
	"dataSource",
	"specificHazardLocalName",
	"specificHazardNationalName",
];

/** Legacy create template header (X1): fieldsDefApi keys minus apiImportId. */
export const X1_CREATE_HEADER: readonly string[] = [
	"parent",
	"hipHazardId",
	"hipClusterId",
	"hipTypeId",
	"approvalStatus",
	"nationalSpecification",
	"startDate",
	"endDate",
	"description",
	"chainsExplanation",
	"magnitude",
	"spatialFootprint",
	"attachments",
	"recordOriginator",
	"hazardousEventStatus",
	"dataSource",
	"countryAccountsId",
];

export class RecordingLogger implements ILogger {
	infoCalls: Record<string, unknown>[] = [];
	errorCalls: Record<string, unknown>[] = [];
	info(data: Record<string, unknown>): void {
		this.infoCalls.push(data);
	}
	warn(): void {}
	error(data: Record<string, unknown>): void {
		this.errorCalls.push(data);
	}
	debug(): void {}
	messages(): unknown[] {
		return this.infoCalls.map((call) => call.msg);
	}
}

/** One ordered log of storage calls and outer commits, so "after commit" is provable (D7). */
export type StorageEvent =
	| { op: "stage" }
	| { op: "promote"; ownerId: string }
	| { op: "delete"; ownerId: string; fileKey: string }
	| { op: "commit" };

/** Real disk adapter underneath, so files exist; `failDelete` makes every delete reject. */
export class RecordingStoragePort implements IAttachmentStoragePort {
	failDelete = false;
	constructor(
		private readonly inner: IAttachmentStoragePort,
		private readonly events: StorageEvent[],
	) {}
	stage(
		tenantId: string,
		file: { name: string; content: Buffer },
	): Promise<StagedFileReference> {
		this.events.push({ op: "stage" });
		return this.inner.stage(tenantId, file);
	}
	promote(
		descriptor: AttachmentDescriptor,
		staged: StagedFileReference,
	): Promise<PromoteResult> {
		this.events.push({ op: "promote", ownerId: descriptor.ownerId });
		return this.inner.promote(descriptor, staged);
	}
	async delete(descriptor: AttachmentDescriptor, fileKey: string) {
		this.events.push({ op: "delete", ownerId: descriptor.ownerId, fileKey });
		if (this.failDelete) {
			throw new Error("simulated delete failure");
		}
		await this.inner.delete(descriptor, fileKey);
	}
	retrieve(descriptor: AttachmentDescriptor, fileKey: string) {
		return this.inner.retrieve(descriptor, fileKey);
	}
}

/** Logs `commit` when an outer transaction (no caller tx) resolves; savepoints are not logged. */
class CommitRecordingRunner implements ITransactionRunner {
	constructor(
		private readonly inner: ITransactionRunner,
		private readonly events: StorageEvent[],
	) {}
	async run<T>(fn: (tx: Tx) => Promise<T>, outerTx?: Tx): Promise<T> {
		const result = await this.inner.run(fn, outerTx);
		if (outerTx === undefined) {
			this.events.push({ op: "commit" });
		}
		return result;
	}
}

export function buildCsvHarness(
	logger: RecordingLogger = new RecordingLogger(),
) {
	const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "delta-he-csv-"));
	const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
	const workflowRepository = new DrizzleWorkflowRepository(dr);
	const causalChainRepository = new DrizzleCausalChainRepository(dr);
	const taxonomyRepository = new DrizzleHazardTaxonomyRepository(dr);
	const divisionRepository = new DrizzleDivisionRepository(dr);
	const recordSpatialObservationUseCase = new RecordSpatialObservationUseCase(
		hazardousEventRepository,
		divisionRepository,
	);
	const specificHazardTaxonomyRepository =
		new DrizzleSpecificHazardTaxonomyRepository(dr);
	const storageEvents: StorageEvent[] = [];
	const transactionRunner = new CommitRecordingRunner(
		new DrizzleTransactionRunner(dr),
		storageEvents,
	);
	const hipCrosswalkPort = new DrizzleHipCrosswalkAdapter(dr);
	const auditLogPort = new DrizzleAuditLogAdapter(dr);
	const attachmentStoragePort = new RecordingStoragePort(
		new LocalDiskAttachmentStorageAdapter(uploadRoot),
		storageEvents,
	);
	const createUseCase = new CreateHazardousEventUseCase(
		logger,
		taxonomyRepository,
		hazardousEventRepository,
		new InitializeWorkflowInstanceUseCase(workflowRepository),
		causalChainRepository,
		recordSpatialObservationUseCase,
		transactionRunner,
		hipCrosswalkPort,
		attachmentStoragePort,
		auditLogPort,
	);
	const updateUseCase = new UpdateHazardousEventUseCase(
		logger,
		taxonomyRepository,
		hazardousEventRepository,
		new GetWorkflowInstanceByEntityUseCase(workflowRepository),
		causalChainRepository,
		recordSpatialObservationUseCase,
		transactionRunner,
		hipCrosswalkPort,
		attachmentStoragePort,
		auditLogPort,
	);
	const applyImportedWorkflowStatusUseCase =
		new ApplyImportedWorkflowStatusUseCase(workflowRepository, auditLogPort);
	const importUseCase = new ImportHazardousEventsCsvUseCase(
		logger,
		hazardousEventRepository,
		specificHazardTaxonomyRepository,
		createUseCase,
		updateUseCase,
		applyImportedWorkflowStatusUseCase,
		new GetWorkflowInstanceByEntityUseCase(workflowRepository),
		transactionRunner,
		divisionRepository,
		attachmentStoragePort,
	);
	const exportUseCase = new ExportHazardousEventsCsvUseCase(
		logger,
		hazardousEventRepository,
	);
	return {
		logger,
		uploadRoot,
		hazardousEventRepository,
		workflowRepository,
		transactionRunner,
		createUseCase,
		recordSpatialObservationUseCase,
		attachmentStoragePort,
		storageEvents,
		applyImportedWorkflowStatusUseCase,
		importUseCase,
		exportUseCase,
		cleanup: () => fs.rmSync(uploadRoot, { recursive: true, force: true }),
	};
}

export type CsvHarness = ReturnType<typeof buildCsvHarness>;

export function runImport(
	harness: CsvHarness,
	args: {
		tenantId: string;
		actingUserId: string;
		role?: string | null;
		mode: string;
		header: readonly string[];
		rows: readonly (readonly string[])[];
	},
): Promise<HazardousEventCsvImportResult> {
	return harness.importUseCase.execute({
		tenantId: args.tenantId,
		actingUserId: args.actingUserId,
		role: args.role === undefined ? "admin" : args.role,
		mode: args.mode,
		header: args.header,
		rows: args.rows,
		firstDataLine: 2,
	});
}

/** Rows from records keyed by column; a missing key is an empty cell. */
export function csvTable(
	header: readonly string[],
	records: readonly Readonly<Record<string, string>>[],
): { header: readonly string[]; rows: string[][] } {
	return {
		header,
		rows: records.map((record) => header.map((column) => record[column] ?? "")),
	};
}

let refCounter = 0;
/** Unique numeric-looking HIP ref, so parallel seeds never collide on source_ref_id. */
export function uniqueRef(): string {
	refCounter += 1;
	return `${parseInt(randomUUID().slice(0, 7), 16)}${refCounter}`;
}

/** CA taxonomy chain whose source refs are fresh legacy-style HIP ids (D13). */
export async function seedTaxonomyWithRefs() {
	const refs = {
		hipTypeId: uniqueRef(),
		hipClusterId: uniqueRef(),
		hipHazardId: uniqueRef(),
	};
	const specificHazardId = await seedSpecificHazard(refs);
	return { specificHazardId, ...refs };
}

/** Legacy hip_* chain plus a CA chain pointing at it, as Phase M seeds production. */
export async function seedLegacyHipWithTaxonomy() {
	const hip = await seedHipChain();
	const specificHazardId = await seedSpecificHazard(hip);
	return { specificHazardId, ...hip };
}

export type SeedWorkflow = "DRAFT" | "SUBMITTED" | "PUBLISHED" | null;

export function caEventProps(
	id: string,
	tenantId: string,
	specificHazardId: string,
	overrides: Partial<HazardousEventProps> = {},
): HazardousEventProps {
	return {
		id,
		tenantId,
		specificHazardId,
		startDate: "2025-01-01",
		endDate: "2025-01-05",
		nationalSpecification: "",
		description: "d1",
		chainsExplanation: "",
		magnitude: "",
		recordOriginator: "Field survey",
		dataSource: "",
		hazardousEventStatus: null,
		specificHazardLocalName: null,
		specificHazardNationalName: null,
		apiImportId: null,
		createdByUserId: null,
		updatedByUserId: null,
		submittedByUserId: null,
		submittedAt: null,
		createdAt: new Date("2025-01-01T00:00:00Z"),
		updatedAt: null,
		hazardDriverIds: [],
		attachments: [],
		fieldValues: [],
		customFieldValues: [],
		...overrides,
	};
}

/** A CA-shaped event plus (unless `null`) its WorkflowInstance in the given status. */
export async function seedCaEvent(
	harness: CsvHarness,
	args: {
		tenantId: string;
		specificHazardId: string;
		overrides?: Partial<HazardousEventProps>;
		workflow?: SeedWorkflow;
	},
): Promise<string> {
	const id = randomUUID();
	await harness.hazardousEventRepository.insert(
		HazardousEvent.create(
			caEventProps(id, args.tenantId, args.specificHazardId, args.overrides),
			new Set(),
			new Set(),
		),
	);
	const workflow = args.workflow === undefined ? "DRAFT" : args.workflow;
	if (workflow !== null) {
		const now = new Date("2025-02-01T00:00:00Z");
		let instance = WorkflowInstance.createDraft({
			id: randomUUID(),
			entityId: id,
			entityType: "HE",
			now,
		});
		if (workflow !== "DRAFT") {
			const userId = await seedUser();
			instance =
				workflow === "SUBMITTED"
					? instance.submit({ userId, now })
					: instance.directPublish({ userId, now });
		}
		await harness.workflowRepository.insert(instance);
	}
	return id;
}

/** Pre-Phase-M row: direct insert with a null specific_hazard_id, as legacy wrote it. */
export async function seedLegacyEvent(args: {
	tenantId: string;
	hip?: { hipTypeId: string; hipClusterId: string; hipHazardId: string };
	approvalStatus?:
		| "draft"
		| "waiting-for-validation"
		| "needs-revision"
		| "validated"
		| "published";
	apiImportId?: string | null;
	startDate?: string;
	description?: string;
}): Promise<string> {
	const [ev] = await dr
		.insert(eventTable)
		.values({})
		.returning({ id: eventTable.id });
	await dr.insert(hazardousEventTable).values({
		id: ev.id,
		countryAccountsId: args.tenantId,
		specificHazardId: null,
		hipHazardId: args.hip?.hipHazardId ?? null,
		hipClusterId: args.hip?.hipClusterId ?? null,
		hipTypeId: args.hip?.hipTypeId ?? null,
		approvalStatus: args.approvalStatus ?? "draft",
		apiImportId: args.apiImportId ?? null,
		startDate: args.startDate ?? "2025-01-01",
		endDate: "2025-01-05",
		recordOriginator: "Legacy originator",
		description: args.description ?? "legacy description",
		attachments: [],
	});
	return ev.id;
}

export async function seedLegacyParentLink(parentId: string, childId: string) {
	await dr
		.insert(eventRelationshipTable)
		.values({ parentId, childId, type: "caused_by" });
}

export async function seedCausalLink(causeId: string, effectId: string) {
	await dr.insert(hazardousEventCausalityTable).values({
		causeHazardousEventId: causeId,
		effectHazardousEventId: effectId,
	});
}

/** Whole-table row counts for the all-or-nothing scenarios. */
export async function globalCounts() {
	const [events] = await dr
		.select({ n: sql<number>`count(*)::int` })
		.from(eventTable);
	const [hazardousEvents] = await dr
		.select({ n: sql<number>`count(*)::int` })
		.from(hazardousEventTable);
	const [workflows] = await dr
		.select({ n: sql<number>`count(*)::int` })
		.from(workflowInstanceTable);
	const [causality] = await dr
		.select({ n: sql<number>`count(*)::int` })
		.from(hazardousEventCausalityTable);
	const [audits] = await dr
		.select({ n: sql<number>`count(*)::int` })
		.from(auditLogsTable);
	const [notifications] = await dr
		.select({ n: sql<number>`count(*)::int` })
		.from(workflowNotificationTable);
	return {
		event: events.n,
		hazardous_event: hazardousEvents.n,
		workflow_instance: workflows.n,
		hazardous_event_causality: causality.n,
		audit_logs: audits.n,
		workflow_notification: notifications.n,
	};
}

/** Full rows of every table an import can touch for one tenant, for "nothing changed". */
export async function tenantSnapshot(tenantId: string) {
	const events = await dr
		.select()
		.from(hazardousEventTable)
		.where(eq(hazardousEventTable.countryAccountsId, tenantId))
		.orderBy(asc(hazardousEventTable.id));
	const ids = events.map((row) => row.id);
	const workflows =
		ids.length === 0
			? []
			: await dr
					.select()
					.from(workflowInstanceTable)
					.where(inArray(workflowInstanceTable.entityId, ids))
					.orderBy(asc(workflowInstanceTable.id));
	const causality =
		ids.length === 0
			? []
			: await dr
					.select()
					.from(hazardousEventCausalityTable)
					.where(
						or(
							inArray(hazardousEventCausalityTable.effectHazardousEventId, ids),
							inArray(hazardousEventCausalityTable.causeHazardousEventId, ids),
						),
					)
					.orderBy(asc(hazardousEventCausalityTable.id));
	const audits = await dr
		.select()
		.from(auditLogsTable)
		.where(eq(auditLogsTable.countryAccountsId, tenantId))
		.orderBy(asc(auditLogsTable.id));
	const observations =
		ids.length === 0
			? []
			: await dr
					.select()
					.from(hazardousEventSpatialObservationTable)
					.where(
						inArray(
							hazardousEventSpatialObservationTable.hazardousEventId,
							ids,
						),
					)
					.orderBy(asc(hazardousEventSpatialObservationTable.id));
	const attachments =
		ids.length === 0
			? []
			: await dr
					.select()
					.from(hazardousEventAttachmentTable)
					.where(inArray(hazardousEventAttachmentTable.hazardousEventId, ids))
					.orderBy(asc(hazardousEventAttachmentTable.id));
	return { events, workflows, causality, audits, observations, attachments };
}

export async function eventsOfTenant(tenantId: string) {
	return dr
		.select()
		.from(hazardousEventTable)
		.where(eq(hazardousEventTable.countryAccountsId, tenantId))
		.orderBy(asc(hazardousEventTable.id));
}

export async function nullTenantEventCount(): Promise<number> {
	const [row] = await dr
		.select({ n: sql<number>`count(*)::int` })
		.from(hazardousEventTable)
		.where(isNull(hazardousEventTable.countryAccountsId));
	return row.n;
}

export async function workflowFor(entityId: string) {
	const [row] = await dr
		.select()
		.from(workflowInstanceTable)
		.where(eq(workflowInstanceTable.entityId, entityId));
	return row;
}

export async function notificationsFor(instanceId: string) {
	return dr
		.select()
		.from(workflowNotificationTable)
		.where(eq(workflowNotificationTable.instanceId, instanceId));
}

export async function causalityForEffect(effectId: string) {
	return dr
		.select()
		.from(hazardousEventCausalityTable)
		.where(eq(hazardousEventCausalityTable.effectHazardousEventId, effectId));
}

/** Export → RFC 4180 text → parsed records, exactly as a downloaded file re-imports. */
export async function exportAndReparse(
	harness: CsvHarness,
	tenantId: string,
): Promise<{ text: string; header: string[]; rows: string[][] }> {
	const exported = await harness.exportUseCase.execute({ tenantId });
	const text = serializeCsv(exported.header, exported.rows);
	const parsed: string[][] = parse(text, { bom: true, trim: true });
	return { text, header: parsed[0], rows: parsed.slice(1) };
}

export async function seedDivision(tenantId: string): Promise<string> {
	const [row] = await dr
		.insert(divisionTable)
		.values({
			name: { en: `Division ${randomUUID()}` },
			countryAccountsId: tenantId,
		})
		.returning({ id: divisionTable.id });
	return row.id;
}

/** Records one observation through the real use case, dated well before any import. */
export async function seedObservation(
	harness: CsvHarness,
	args: {
		tenantId: string;
		eventId: string;
		geometries: unknown[];
		divisionIds?: string[];
		observationTime?: Date;
	},
): Promise<void> {
	await harness.recordSpatialObservationUseCase.execute({
		tenantId: args.tenantId,
		hazardousEventId: args.eventId,
		observationTime: args.observationTime ?? new Date("2025-06-01T00:00:00Z"),
		geometries: args.geometries,
		divisionIds: args.divisionIds ?? [],
	});
}

/** Pre-Phase-M footprint rows, written directly as legacy stored them. */
export async function seedLegacyFootprint(
	eventId: string,
	geometries: unknown[],
	divisionIds: string[] = [],
): Promise<void> {
	for (const geometry of geometries) {
		await dr.insert(hazardousEventGeomTable).values({
			hazardousEventId: eventId,
			geom: sql`ST_GeomFromGeoJSON(${JSON.stringify(geometry)})`,
		});
	}
	for (const divisionId of divisionIds) {
		await dr
			.insert(hazardousEventDivisionTable)
			.values({ hazardousEventId: eventId, divisionId });
	}
}

export async function observationCount(eventId: string): Promise<number> {
	const [row] = await dr
		.select({ n: sql<number>`count(*)::int` })
		.from(hazardousEventSpatialObservationTable)
		.where(eq(hazardousEventSpatialObservationTable.hazardousEventId, eventId));
	return row.n;
}

export async function totalObservationCount(): Promise<number> {
	const [row] = await dr
		.select({ n: sql<number>`count(*)::int` })
		.from(hazardousEventSpatialObservationTable);
	return row.n;
}

/** The latest observation as the repository reads it (geometries via ST_AsGeoJSON). */
export async function currentFootprint(
	harness: CsvHarness,
	tenantId: string,
	eventId: string,
) {
	return harness.hazardousEventRepository.findCurrentSpatialObservation(
		eventId,
		tenantId,
	);
}

/** A CA event holding one genuinely promoted File attachment K, plus optional Link rows. */
export async function seedCaEventWithFile(
	harness: CsvHarness,
	args: {
		tenantId: string;
		specificHazardId: string;
		fileName?: string;
		links?: { title: string; url: string }[];
		workflow?: SeedWorkflow;
	},
): Promise<{ id: string; fileKey: string; filePath: string }> {
	const id = randomUUID();
	const staged = await harness.attachmentStoragePort.stage(args.tenantId, {
		name: args.fileName ?? "report.pdf",
		content: Buffer.from("csv-6d2"),
	});
	const promoted = await harness.attachmentStoragePort.promote(
		{
			tenantId: args.tenantId,
			ownerType: HAZARDOUS_EVENT_ATTACHMENT_OWNER_TYPE,
			ownerId: id,
		},
		staged,
	);
	await harness.hazardousEventRepository.insert(
		HazardousEvent.create(
			caEventProps(id, args.tenantId, args.specificHazardId, {
				attachments: [
					{
						id: "file",
						title: "Scan",
						type: "File",
						url: null,
						tag: null,
						fileKey: promoted.fileKey,
						fileName: promoted.fileName,
						fileType: "application/pdf",
						fileSize: promoted.fileSize,
					},
					...(args.links ?? []).map((link, index) => ({
						id: `link-${index}`,
						title: link.title,
						type: "Link" as const,
						url: link.url,
						tag: null,
						fileKey: null,
						fileName: null,
						fileType: null,
						fileSize: null,
					})),
				],
			}),
			new Set(),
			new Set(),
		),
	);
	const workflow = args.workflow === undefined ? "DRAFT" : args.workflow;
	if (workflow !== null) {
		await harness.workflowRepository.insert(
			WorkflowInstance.createDraft({
				id: randomUUID(),
				entityId: id,
				entityType: "HE",
				now: new Date("2025-02-01T00:00:00Z"),
			}),
		);
	}
	const filePath = path.join(
		harness.uploadRoot,
		`tenant-${args.tenantId}`,
		"hazardous-event",
		id,
		promoted.fileKey,
	);
	// Seeding calls are not part of what a test asserts.
	harness.storageEvents.length = 0;
	return { id, fileKey: promoted.fileKey, filePath };
}

export async function attachmentRowsOf(eventId: string) {
	return dr
		.select()
		.from(hazardousEventAttachmentTable)
		.where(eq(hazardousEventAttachmentTable.hazardousEventId, eventId));
}

export { seedUser };
