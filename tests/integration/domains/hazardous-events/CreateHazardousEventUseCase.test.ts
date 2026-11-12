import "../../db/setup";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dr } from "~/db.server";
import { ValidationError } from "~/shared/errors";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { auditLogsTable } from "~/drizzle/schema/auditLogsTable";
import { hazardousEventAttachmentTable } from "~/domains/hazardous-events/infrastructure/hazardousEventAttachmentTable";
import { DrizzleTransactionRunner } from "~/infrastructure/DrizzleTransactionRunner.server";
import { DrizzleHazardousEventRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server";
import { DrizzleCausalChainRepository } from "~/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server";
import { DrizzleHazardTaxonomyRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardTaxonomyRepository.server";
import { DrizzleHipCrosswalkAdapter } from "~/domains/hazardous-events/infrastructure/DrizzleHipCrosswalkAdapter.server";
import type { IHipCrosswalkPort } from "~/domains/hazardous-events/application/ports/IHipCrosswalkPort";
import { DrizzleWorkflowRepository } from "~/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server";
import { InitializeWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/InitializeWorkflowInstance";
import { workflowInstanceTable } from "~/domains/validation-workflow/infrastructure/workflowInstanceTable";
import { CreateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/CreateHazardousEvent";
import {
	HazardousEvent,
	type HazardousEventProps,
} from "~/domains/hazardous-events/domain/HazardousEvent";
import { LocalDiskAttachmentStorageAdapter } from "~/domains/shared/attachments/infrastructure/LocalDiskAttachmentStorageAdapter.server";
import { DrizzleAuditLogAdapter } from "~/domains/shared/audit-log/infrastructure/DrizzleAuditLogAdapter.server";
import type { ILogger } from "~/shared/logging/ILogger";
import {
	seedCountryAccount,
	seedSpecificHazard,
	seedUser,
} from "../../db/models/hazardousEventTestHelpers";

// Per-test temp upload root for the real adapter (9th ctor arg) -- isolated from uploads/.
let uploadRoot: string;
let attachmentStoragePort: LocalDiskAttachmentStorageAdapter;

beforeEach(() => {
	uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "delta-create-he-test-"));
	attachmentStoragePort = new LocalDiskAttachmentStorageAdapter(uploadRoot);
});

afterEach(() => {
	fs.rmSync(uploadRoot, { recursive: true, force: true });
});

/** Code-review (Gate 8) finding -- the rollback tests below assert on hazardousEventTable but
 * not on audit_logs, leaving design.md Decision 6's "succeed or fail together" guarantee
 * unproven against the real adapter. */
async function auditRowsForTenant(tenantId: string) {
	return dr
		.select()
		.from(auditLogsTable)
		.where(eq(auditLogsTable.countryAccountsId, tenantId));
}

function baseEventProps(
	id: string,
	tenantId: string,
	specificHazardId: string,
): HazardousEventProps {
	return {
		id,
		tenantId,
		specificHazardId,
		startDate: "2026-01-01",
		endDate: "",
		nationalSpecification: "",
		description: "",
		chainsExplanation: "",
		magnitude: "",
		recordOriginator: "",
		dataSource: "",
		hazardousEventStatus: null,
		specificHazardLocalName: null,
		specificHazardNationalName: null,
		apiImportId: null,
		createdByUserId: null,
		updatedByUserId: null,
		submittedByUserId: null,
		submittedAt: null,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: null,
		hazardDriverIds: [],
		attachments: [],
		fieldValues: [],
		customFieldValues: [],
	};
}

class NoOpLogger implements ILogger {
	info(): void {}
	warn(): void {}
	error(): void {}
	debug(): void {}
}

/** Shared scaffolding for the attachment-promotion scenarios below (ca-shared-attachments-module). */
async function baseAttachmentTestCommand(
	tenantId: string,
	specificHazardId: string,
) {
	return {
		tenantId,
		specificHazardId,
		startDate: "2026-01-01",
		endDate: "",
		nationalSpecification: "",
		description: "",
		chainsExplanation: "",
		magnitude: "",
		recordOriginator: "",
		dataSource: "",
		hazardousEventStatus: null,
		specificHazardLocalName: null,
		specificHazardNationalName: null,
		apiImportId: null,
		actingUserId: await seedUser(),
		hazardDriverIds: [],
		fieldValues: [],
		customFieldValues: [],
	} as const;
}

function makeAttachmentTestUseCase(
	hazardousEventRepository: DrizzleHazardousEventRepository,
	workflowRepository: DrizzleWorkflowRepository,
	causalChainRepository: DrizzleCausalChainRepository,
	taxonomyRepository: DrizzleHazardTaxonomyRepository,
	transactionRunner: DrizzleTransactionRunner,
	hipCrosswalkPort: IHipCrosswalkPort,
): CreateHazardousEventUseCase {
	return new CreateHazardousEventUseCase(
		new NoOpLogger(),
		taxonomyRepository,
		hazardousEventRepository,
		new InitializeWorkflowInstanceUseCase(workflowRepository),
		causalChainRepository,
		{ execute: vi.fn() },
		transactionRunner,
		hipCrosswalkPort,
		attachmentStoragePort,
		new DrizzleAuditLogAdapter(dr),
	);
}

describe("CreateHazardousEventUseCase against real adapters (DEF-026 rollback proof)", () => {
	it("a stubbed rejection on the workflow insert leaves zero rows persisted — the earlier HazardousEvent insert rolls back too", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
		const workflowRepository = new DrizzleWorkflowRepository(dr);
		const causalChainRepository = new DrizzleCausalChainRepository(dr);
		const taxonomyRepository = new DrizzleHazardTaxonomyRepository(dr);
		const transactionRunner = new DrizzleTransactionRunner(dr);
		const hipCrosswalkPort = new DrizzleHipCrosswalkAdapter(dr);
		const recordSpatialObservationUseCase = { execute: vi.fn() };
		const useCase = new CreateHazardousEventUseCase(
			new NoOpLogger(),
			taxonomyRepository,
			hazardousEventRepository,
			new InitializeWorkflowInstanceUseCase(workflowRepository),
			causalChainRepository,
			recordSpatialObservationUseCase,
			transactionRunner,
			hipCrosswalkPort,
			attachmentStoragePort,
			new DrizzleAuditLogAdapter(dr),
		);

		vi.spyOn(workflowRepository, "insert").mockRejectedValueOnce(
			new Error("boom-workflow-insert"),
		);

		await expect(
			useCase.execute({
				tenantId,
				specificHazardId,
				startDate: "2026-01-01",
				endDate: "",
				nationalSpecification: "",
				description: "",
				chainsExplanation: "",
				magnitude: "",
				recordOriginator: "",
				dataSource: "",
				hazardousEventStatus: null,
				specificHazardLocalName: null,
				specificHazardNationalName: null,
				apiImportId: null,
				actingUserId: await seedUser(),
				hazardDriverIds: [],
				attachments: [],
				fieldValues: [],
				customFieldValues: [],
			}),
		).rejects.toThrow("boom-workflow-insert");

		// Zero HazardousEvent rows persisted for this tenant — the earlier insert rolled back too.
		const rows = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.countryAccountsId, tenantId));
		expect(rows).toHaveLength(0);
		// record() already ran (immediately after the event insert, before workflow.insert) --
		// the same rollback must remove its row too (design.md Decision 6).
		expect(await auditRowsForTenant(tenantId)).toHaveLength(0);
	});

	// Spec's own "A rolled-back transaction leaves zero rows persisted, regardless of which
	// write failed" scenario, the saveEdge half (create-hazardous-event spec) -- this is also
	// the path that nests the advisory-lock SAVEPOINT inside the outer transaction
	// (design.md Risks), so it needs proof against a real adapter, not just fakes.
	it("a stubbed rejection on the causal edge save, with a causeId present, leaves zero rows persisted — neither the new event, its workflow, nor the cause's own edge count change", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const causeId = randomUUID();
		const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
		const workflowRepository = new DrizzleWorkflowRepository(dr);
		const causalChainRepository = new DrizzleCausalChainRepository(dr);
		const taxonomyRepository = new DrizzleHazardTaxonomyRepository(dr);
		const transactionRunner = new DrizzleTransactionRunner(dr);

		await hazardousEventRepository.insert(
			HazardousEvent.create(
				baseEventProps(causeId, tenantId, specificHazardId),
				new Set(),
				new Set(),
			),
		);

		const hipCrosswalkPort = new DrizzleHipCrosswalkAdapter(dr);
		const recordSpatialObservationUseCase = { execute: vi.fn() };
		const useCase = new CreateHazardousEventUseCase(
			new NoOpLogger(),
			taxonomyRepository,
			hazardousEventRepository,
			new InitializeWorkflowInstanceUseCase(workflowRepository),
			causalChainRepository,
			recordSpatialObservationUseCase,
			transactionRunner,
			hipCrosswalkPort,
			attachmentStoragePort,
			new DrizzleAuditLogAdapter(dr),
		);
		vi.spyOn(causalChainRepository, "saveEdge").mockRejectedValueOnce(
			new Error("boom-save-edge"),
		);

		await expect(
			useCase.execute({
				tenantId,
				specificHazardId,
				startDate: "2026-02-01",
				endDate: "",
				nationalSpecification: "",
				description: "",
				chainsExplanation: "",
				magnitude: "",
				recordOriginator: "",
				dataSource: "",
				hazardousEventStatus: null,
				specificHazardLocalName: null,
				specificHazardNationalName: null,
				apiImportId: null,
				actingUserId: await seedUser(),
				hazardDriverIds: [],
				attachments: [],
				fieldValues: [],
				customFieldValues: [],
				causeId,
			}),
		).rejects.toThrow("boom-save-edge");

		// Only the pre-seeded cause row remains for this tenant -- the new event's own insert
		// rolled back too, not just the failed edge write.
		const rows = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.countryAccountsId, tenantId));
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe(causeId);
		await expect(
			causalChainRepository.findReachableEdgesFrom(causeId),
		).resolves.toEqual([]);
		// This is the real tx-threading proof: unlike the test above (whose workflow insert is
		// mocked out before it ever reaches the DB), this one's InitializeWorkflowInstanceUseCase
		// call runs for real — a forgotten tx would let this row survive the rollback.
		expect(await dr.select().from(workflowInstanceTable)).toHaveLength(0);
		expect(await auditRowsForTenant(tenantId)).toHaveLength(0);
	});

	// Decision 3's own rollback requirement -- the fakes-based unit test cannot prove a real
	// rollback since its fake transactionRunner has no transactional semantics.
	it("a stubbed rejection on the delegated spatialObservation call leaves zero rows persisted, including the already-inserted event", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
		const workflowRepository = new DrizzleWorkflowRepository(dr);
		const causalChainRepository = new DrizzleCausalChainRepository(dr);
		const taxonomyRepository = new DrizzleHazardTaxonomyRepository(dr);
		const transactionRunner = new DrizzleTransactionRunner(dr);
		const hipCrosswalkPort = new DrizzleHipCrosswalkAdapter(dr);
		const recordSpatialObservationUseCase = {
			execute: vi.fn().mockRejectedValue(new Error("boom-spatial-observation")),
		};
		const useCase = new CreateHazardousEventUseCase(
			new NoOpLogger(),
			taxonomyRepository,
			hazardousEventRepository,
			new InitializeWorkflowInstanceUseCase(workflowRepository),
			causalChainRepository,
			recordSpatialObservationUseCase,
			transactionRunner,
			hipCrosswalkPort,
			attachmentStoragePort,
			new DrizzleAuditLogAdapter(dr),
		);

		await expect(
			useCase.execute({
				tenantId,
				specificHazardId,
				startDate: "2026-01-01",
				endDate: "",
				nationalSpecification: "",
				description: "",
				chainsExplanation: "",
				magnitude: "",
				recordOriginator: "",
				dataSource: "",
				hazardousEventStatus: null,
				specificHazardLocalName: null,
				specificHazardNationalName: null,
				apiImportId: null,
				actingUserId: await seedUser(),
				hazardDriverIds: [],
				attachments: [],
				fieldValues: [],
				customFieldValues: [],
				spatialObservation: { geometries: [], divisionIds: [] },
			}),
		).rejects.toThrow("boom-spatial-observation");

		const rows = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.countryAccountsId, tenantId));
		expect(rows).toHaveLength(0);
		expect(await dr.select().from(workflowInstanceTable)).toHaveLength(0);
		expect(await auditRowsForTenant(tenantId)).toHaveLength(0);
	});

	// design.md Decision 17 (task 9d.7's real-rollback proof) -- stamp() runs inside the same tx
	// as the event/workflow insert, immediately after the event insert; a failure there must roll
	// back the whole transaction, same as every other write in this sequence.
	it("a stubbed rejection on IHipCrosswalkPort.stamp() leaves zero rows persisted, including the already-inserted event and workflow", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
		const workflowRepository = new DrizzleWorkflowRepository(dr);
		const causalChainRepository = new DrizzleCausalChainRepository(dr);
		const taxonomyRepository = new DrizzleHazardTaxonomyRepository(dr);
		const transactionRunner = new DrizzleTransactionRunner(dr);
		const hipCrosswalkPort: IHipCrosswalkPort = new DrizzleHipCrosswalkAdapter(
			dr,
		);
		const recordSpatialObservationUseCase = { execute: vi.fn() };
		const useCase = new CreateHazardousEventUseCase(
			new NoOpLogger(),
			taxonomyRepository,
			hazardousEventRepository,
			new InitializeWorkflowInstanceUseCase(workflowRepository),
			causalChainRepository,
			recordSpatialObservationUseCase,
			transactionRunner,
			hipCrosswalkPort,
			attachmentStoragePort,
			new DrizzleAuditLogAdapter(dr),
		);
		vi.spyOn(hipCrosswalkPort, "stamp").mockRejectedValueOnce(
			new Error("boom-stamp"),
		);

		await expect(
			useCase.execute({
				tenantId,
				specificHazardId,
				startDate: "2026-01-01",
				endDate: "",
				nationalSpecification: "",
				description: "",
				chainsExplanation: "",
				magnitude: "",
				recordOriginator: "",
				dataSource: "",
				hazardousEventStatus: null,
				specificHazardLocalName: null,
				specificHazardNationalName: null,
				apiImportId: null,
				actingUserId: await seedUser(),
				hazardDriverIds: [],
				attachments: [],
				fieldValues: [],
				customFieldValues: [],
			}),
		).rejects.toThrow("boom-stamp");

		const rows = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.countryAccountsId, tenantId));
		expect(rows).toHaveLength(0);
		expect(await dr.select().from(workflowInstanceTable)).toHaveLength(0);
		expect(await auditRowsForTenant(tenantId)).toHaveLength(0);
	});
});

// specs/shared-audit-log-port, specs/create-hazardous-event -- a successful create writes
// exactly one correctly-shaped audit_logs row (ca-shared-audit-log).
describe("CreateHazardousEventUseCase audit log write (ca-shared-audit-log)", () => {
	it("writes exactly one audit_logs row with the inserted event as newValues, single-encoded", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const actingUserId = await seedUser();
		const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
		const workflowRepository = new DrizzleWorkflowRepository(dr);
		const causalChainRepository = new DrizzleCausalChainRepository(dr);
		const taxonomyRepository = new DrizzleHazardTaxonomyRepository(dr);
		const useCase = new CreateHazardousEventUseCase(
			new NoOpLogger(),
			taxonomyRepository,
			hazardousEventRepository,
			new InitializeWorkflowInstanceUseCase(workflowRepository),
			causalChainRepository,
			{ execute: vi.fn() },
			new DrizzleTransactionRunner(dr),
			new DrizzleHipCrosswalkAdapter(dr),
			attachmentStoragePort,
			new DrizzleAuditLogAdapter(dr),
		);

		const dto = await useCase.execute({
			tenantId,
			specificHazardId,
			startDate: "2026-01-01",
			endDate: "",
			nationalSpecification: "",
			description: "",
			chainsExplanation: "",
			magnitude: "",
			recordOriginator: "",
			dataSource: "",
			hazardousEventStatus: null,
			specificHazardLocalName: null,
			specificHazardNationalName: null,
			apiImportId: null,
			actingUserId,
			hazardDriverIds: [],
			attachments: [],
			fieldValues: [],
			customFieldValues: [],
		});

		const rows = await dr
			.select()
			.from(auditLogsTable)
			.where(eq(auditLogsTable.recordId, dto.id));
		expect(rows).toHaveLength(1);
		const [row] = rows;
		expect(row.tableName).toBe("hazardous_event");
		expect(row.userId).toBe(actingUserId);
		expect(row.action).toBe("Create hazardous event");
		expect(row.oldValues).toBeNull();
		expect(row.countryAccountsId).toBe(tenantId);
		// Single-encoded, not double-JSON.stringify()'d (design.md Decision 4) -- parsing once
		// yields the plain field object, not a further-nested JSON string.
		const newValues = row.newValues as Record<string, unknown>;
		expect(newValues.id).toBe(dto.id);
		expect(typeof newValues.description).toBe("string");
	});
});

// ca-shared-attachments-module, specs/create-hazardous-event/spec.md -- real PGlite + real
// LocalDiskAttachmentStorageAdapter, no mocks, proving promote-wiring end to end.
describe("CreateHazardousEventUseCase attachment promotion (ca-shared-attachments-module)", () => {
	it("promotes a File-type attachment from temp to permanent storage on create", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
		const useCase = makeAttachmentTestUseCase(
			hazardousEventRepository,
			new DrizzleWorkflowRepository(dr),
			new DrizzleCausalChainRepository(dr),
			new DrizzleHazardTaxonomyRepository(dr),
			new DrizzleTransactionRunner(dr),
			new DrizzleHipCrosswalkAdapter(dr),
		);

		const staged = await attachmentStoragePort.stage(tenantId, {
			name: "report.pdf",
			content: Buffer.from("hello"),
		});
		const tempPath = path.join(
			uploadRoot,
			`tenant-${tenantId}`,
			"temp",
			staged.name,
		);
		expect(fs.existsSync(tempPath)).toBe(true);

		const dto = await useCase.execute({
			...(await baseAttachmentTestCommand(tenantId, specificHazardId)),
			attachments: [
				{
					kind: "newFile",
					id: "1",
					title: "Report",
					tag: null,
					stagedFileName: staged.name,
					contentType: "application/pdf",
				},
			],
		});

		expect(dto.attachments).toHaveLength(1);
		const [attachment] = dto.attachments;
		expect(attachment.type).toBe("File");
		expect(attachment.fileKey).toBe(staged.name);

		// Proof is on disk, not just the DTO -- confirms the file actually moved.
		expect(fs.existsSync(tempPath)).toBe(false);
		const permanentPath = path.join(
			uploadRoot,
			`tenant-${tenantId}`,
			"hazardous-event",
			dto.id,
			attachment.fileKey as string,
		);
		expect(fs.existsSync(permanentPath)).toBe(true);

		const persisted = await hazardousEventRepository.findById(dto.id, tenantId);
		expect(persisted.attachments[0].fileKey).toBe(staged.name);
	});

	it("persists a Link-type attachment as submitted, with no promote() call", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
		const useCase = makeAttachmentTestUseCase(
			hazardousEventRepository,
			new DrizzleWorkflowRepository(dr),
			new DrizzleCausalChainRepository(dr),
			new DrizzleHazardTaxonomyRepository(dr),
			new DrizzleTransactionRunner(dr),
			new DrizzleHipCrosswalkAdapter(dr),
		);
		const promoteSpy = vi.spyOn(attachmentStoragePort, "promote");

		const dto = await useCase.execute({
			...(await baseAttachmentTestCommand(tenantId, specificHazardId)),
			attachments: [
				{
					kind: "link",
					id: "1",
					title: "Ref",
					tag: null,
					url: "https://example.com",
				},
			],
		});

		expect(promoteSpy).not.toHaveBeenCalled();
		expect(dto.attachments).toHaveLength(1);
		const [attachment] = dto.attachments;
		expect(attachment.type).toBe("Link");
		expect(attachment.url).toBe("https://example.com");
		expect(attachment.fileKey).toBeNull();
		expect(attachment.fileName).toBeNull();
		expect(attachment.fileType).toBeNull();
		expect(attachment.fileSize).toBeNull();
	});

	it("rolls back the whole transaction when promoting a File-type attachment fails", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
		const useCase = makeAttachmentTestUseCase(
			hazardousEventRepository,
			new DrizzleWorkflowRepository(dr),
			new DrizzleCausalChainRepository(dr),
			new DrizzleHazardTaxonomyRepository(dr),
			new DrizzleTransactionRunner(dr),
			new DrizzleHipCrosswalkAdapter(dr),
		);

		// Diffs, not whole-table-zero -- earlier tests in this describe already committed rows.
		const workflowCountBefore = (await dr.select().from(workflowInstanceTable))
			.length;
		const attachmentCountBefore = (
			await dr.select().from(hazardousEventAttachmentTable)
		).length;

		// Must fail for the right reason: the adapter's own ValidationError wrapping the real
		// fs.rename() ENOENT (Gate 10 finding -- a raw ENOENT would otherwise surface as a
		// generic 500 instead of a catchable, user-facing error), since the file was never staged.
		let caught: unknown;
		try {
			await useCase.execute({
				...(await baseAttachmentTestCommand(tenantId, specificHazardId)),
				attachments: [
					{
						kind: "newFile",
						id: "1",
						title: "Missing",
						tag: null,
						stagedFileName: "never-staged-file.pdf",
						contentType: "application/pdf",
					},
				],
			});
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(ValidationError);

		const rows = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.countryAccountsId, tenantId));
		expect(rows).toHaveLength(0);
		expect(await dr.select().from(workflowInstanceTable)).toHaveLength(
			workflowCountBefore,
		);
		expect(await dr.select().from(hazardousEventAttachmentTable)).toHaveLength(
			attachmentCountBefore,
		);
	});
});
