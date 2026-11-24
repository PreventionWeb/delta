import "../../db/setup";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dr } from "~/db.server";
import { auditLogsTable } from "~/drizzle/schema/auditLogsTable";
import { DrizzleTransactionRunner } from "~/infrastructure/DrizzleTransactionRunner.server";
import { DrizzleHazardousEventRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server";
import { DrizzleCausalChainRepository } from "~/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server";
import { DrizzleHazardTaxonomyRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardTaxonomyRepository.server";
import { DrizzleHipCrosswalkAdapter } from "~/domains/hazardous-events/infrastructure/DrizzleHipCrosswalkAdapter.server";
import { DrizzleWorkflowRepository } from "~/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server";
import { GetWorkflowInstanceByEntityUseCase } from "~/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity";
import { WorkflowInstance } from "~/domains/validation-workflow/domain/WorkflowInstance";
import {
	HazardousEvent,
	type HazardousEventAttachmentProps,
	type HazardousEventProps,
} from "~/domains/hazardous-events/domain/HazardousEvent";
import { UpdateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent";
import { LocalDiskAttachmentStorageAdapter } from "~/domains/shared/attachments/infrastructure/LocalDiskAttachmentStorageAdapter.server";
import { DrizzleAuditLogAdapter } from "~/domains/shared/audit-log/infrastructure/DrizzleAuditLogAdapter.server";
import { ConflictError } from "~/shared/errors";
import type { ILogger } from "~/shared/logging/ILogger";
import {
	seedCountryAccount,
	seedSpecificHazard,
	seedUser,
} from "../../db/models/hazardousEventTestHelpers";

class NoOpLogger implements ILogger {
	info(): void {}
	warn(): void {}
	error(): void {}
	debug(): void {}
}

class RecordingLogger implements ILogger {
	infoCalls: Record<string, unknown>[] = [];
	info(data: Record<string, unknown>): void {
		this.infoCalls.push(data);
	}
	warn(): void {}
	error(): void {}
	debug(): void {}
}

function baseEventProps(
	id: string,
	tenantId: string,
	specificHazardId: string,
	overrides: Partial<HazardousEventProps> = {},
): HazardousEventProps {
	return {
		id,
		tenantId,
		specificHazardId,
		startDate: "2026-01-01",
		endDate: "",
		nationalSpecification: "",
		description: "original description",
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
		...overrides,
	};
}

/** Code-review (Gate 8) finding -- the rollback tests below assert on the event's own row but
 * not on audit_logs, leaving design.md Decision 6's "succeed or fail together" guarantee
 * unproven against the real adapter. */
async function auditRowsFor(recordId: string) {
	return dr
		.select()
		.from(auditLogsTable)
		.where(eq(auditLogsTable.recordId, recordId));
}

/** Builds every collaborator a fresh test needs, wired exactly like the real DI module
 * (HazardousEventsModule.server.ts) -- real Drizzle adapters + a real LocalDiskAttachmentStorageAdapter
 * pointed at this test's own per-test temp directory, no mocks. */
function createHarness(uploadRoot: string, logger: ILogger = new NoOpLogger()) {
	const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
	const workflowRepository = new DrizzleWorkflowRepository(dr);
	const causalChainRepository = new DrizzleCausalChainRepository(dr);
	const taxonomyRepository = new DrizzleHazardTaxonomyRepository(dr);
	const transactionRunner = new DrizzleTransactionRunner(dr);
	const hipCrosswalkPort = new DrizzleHipCrosswalkAdapter(dr);
	const recordSpatialObservationUseCase = { execute: vi.fn() };
	const attachmentStoragePort = new LocalDiskAttachmentStorageAdapter(
		uploadRoot,
	);
	const useCase = new UpdateHazardousEventUseCase(
		logger,
		taxonomyRepository,
		hazardousEventRepository,
		new GetWorkflowInstanceByEntityUseCase(workflowRepository),
		causalChainRepository,
		recordSpatialObservationUseCase,
		transactionRunner,
		hipCrosswalkPort,
		attachmentStoragePort,
		new DrizzleAuditLogAdapter(dr),
	);
	return {
		hazardousEventRepository,
		workflowRepository,
		causalChainRepository,
		taxonomyRepository,
		transactionRunner,
		hipCrosswalkPort,
		recordSpatialObservationUseCase,
		attachmentStoragePort,
		useCase,
	};
}

function fileAttachment(
	overrides: Partial<HazardousEventAttachmentProps> = {},
): HazardousEventAttachmentProps {
	return {
		id: randomUUID(),
		title: "Existing file",
		type: "File",
		url: null,
		tag: null,
		fileKey: "existing-file-key",
		fileName: "existing.pdf",
		fileType: "application/pdf",
		fileSize: 123,
		...overrides,
	};
}

function linkAttachment(
	overrides: Partial<HazardousEventAttachmentProps> = {},
): HazardousEventAttachmentProps {
	return {
		id: randomUUID(),
		title: "Existing link",
		type: "Link",
		url: "https://example.com/resource",
		tag: null,
		fileKey: null,
		fileName: null,
		fileType: null,
		fileSize: null,
		...overrides,
	};
}

function permanentFilePath(
	uploadRoot: string,
	tenantId: string,
	eventId: string,
	fileKey: string,
): string {
	return path.join(
		uploadRoot,
		`tenant-${tenantId}`,
		"hazardous-event",
		eventId,
		fileKey,
	);
}

describe("UpdateHazardousEventUseCase against real adapters (DEF-026 rollback proof)", () => {
	it("a stubbed ConflictError from the delegated spatial-observation call leaves the HazardousEvent's prior field values intact", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const id = randomUUID();
		const uploadRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "delta-update-he-test-"),
		);
		const harness = createHarness(uploadRoot);

		await harness.hazardousEventRepository.insert(
			HazardousEvent.create(
				baseEventProps(id, tenantId, specificHazardId),
				new Set(),
				new Set(),
			),
		);
		await harness.workflowRepository.insert(
			WorkflowInstance.createDraft({
				id: randomUUID(),
				entityId: id,
				entityType: "HE",
				now: new Date("2026-01-01T00:00:00Z"),
			}),
		);

		harness.recordSpatialObservationUseCase.execute.mockRejectedValue(
			new ConflictError("duplicate observationTime", {}),
		);

		await expect(
			harness.useCase.execute({
				id,
				tenantId,
				actingUserId: await seedUser(),
				description: "attempted new description",
				spatialObservation: { geometries: [], divisionIds: [] },
			}),
		).rejects.toThrow(ConflictError);

		const found = await harness.hazardousEventRepository.findById(id, tenantId);
		expect(found.description).toBe("original description");
		// record() already ran (immediately after update(), before the spatial-observation
		// delegation) -- the same rollback must remove its row too (design.md Decision 6).
		expect(await auditRowsFor(id)).toHaveLength(0);

		await fs.rm(uploadRoot, { recursive: true, force: true });
	});

	// Spec's own "whole write sequence rolls back" scenario, the replaceCauseEdge half -- the
	// fakes-based unit test for this path (UpdateHazardousEvent.test.ts) cannot prove a real
	// rollback, since its fake causalChainRepository has no transactional semantics.
	it("a stubbed Error from replaceCauseEdge leaves both the HazardousEvent's prior field values and its prior causal link intact", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const effectId = randomUUID();
		const priorCauseId = randomUUID();
		const newCauseId = randomUUID();
		const uploadRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "delta-update-he-test-"),
		);
		const harness = createHarness(uploadRoot);

		await harness.hazardousEventRepository.insert(
			HazardousEvent.create(
				{
					...baseEventProps(effectId, tenantId, specificHazardId),
					startDate: "2026-06-01",
				},
				new Set(),
				new Set(),
			),
		);
		await harness.workflowRepository.insert(
			WorkflowInstance.createDraft({
				id: randomUUID(),
				entityId: effectId,
				entityType: "HE",
				now: new Date("2026-01-01T00:00:00Z"),
			}),
		);
		await harness.hazardousEventRepository.insert(
			HazardousEvent.create(
				{
					...baseEventProps(priorCauseId, tenantId, specificHazardId),
					startDate: "2026-01-01",
				},
				new Set(),
				new Set(),
			),
		);
		await harness.hazardousEventRepository.insert(
			HazardousEvent.create(
				{
					...baseEventProps(newCauseId, tenantId, specificHazardId),
					startDate: "2026-02-01",
				},
				new Set(),
				new Set(),
			),
		);
		await harness.causalChainRepository.saveEdge(
			{ causeId: priorCauseId, effectId },
			null,
		);

		vi.spyOn(
			harness.causalChainRepository,
			"replaceCauseEdge",
		).mockRejectedValueOnce(new Error("boom-replace-cause-edge"));

		await expect(
			harness.useCase.execute({
				id: effectId,
				tenantId,
				actingUserId: await seedUser(),
				description: "attempted new description",
				causeId: newCauseId,
			}),
		).rejects.toThrow("boom-replace-cause-edge");

		const found = await harness.hazardousEventRepository.findById(
			effectId,
			tenantId,
		);
		expect(found.description).toBe("original description");
		const edgesFromPriorCause =
			await harness.causalChainRepository.findReachableEdgesFrom(priorCauseId);
		expect(edgesFromPriorCause).toContainEqual({
			causeId: priorCauseId,
			effectId,
		});
		const edgesFromNewCause =
			await harness.causalChainRepository.findReachableEdgesFrom(newCauseId);
		expect(edgesFromNewCause).toEqual([]);
		expect(await auditRowsFor(effectId)).toHaveLength(0);

		await fs.rm(uploadRoot, { recursive: true, force: true });
	});

	// Migrated from RecordSpatialObservation.test.ts (design.md Decision 6 addendum) --
	// RecordSpatialObservationUseCase no longer logs its own success; this use case, its only
	// current caller, does so itself, after its own outer transaction has actually committed
	// against the real adapter (not just after a fake's trivial await).
	it("logs spatial_observation.recorded, after the real transaction has committed, when a spatial observation is bundled", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const id = randomUUID();
		const uploadRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "delta-update-he-test-"),
		);
		const logger = new RecordingLogger();
		const harness = createHarness(uploadRoot, logger);

		await harness.hazardousEventRepository.insert(
			HazardousEvent.create(
				baseEventProps(id, tenantId, specificHazardId),
				new Set(),
				new Set(),
			),
		);
		await harness.workflowRepository.insert(
			WorkflowInstance.createDraft({
				id: randomUUID(),
				entityId: id,
				entityType: "HE",
				now: new Date("2026-01-01T00:00:00Z"),
			}),
		);

		const observationTime = new Date("2026-03-01T00:00:00.000Z");
		harness.recordSpatialObservationUseCase.execute.mockResolvedValue({
			id: randomUUID(),
			hazardousEventId: id,
			observationTime: observationTime.toISOString(),
			note: null,
			geometries: [],
			divisionIds: [],
			createdAt: observationTime.toISOString(),
			updatedAt: observationTime.toISOString(),
		});

		await harness.useCase.execute({
			id,
			tenantId,
			actingUserId: await seedUser(),
			description: "updated description",
			spatialObservation: { observationTime, geometries: [], divisionIds: [] },
		});

		// By the time this call returns, the transaction has genuinely committed against the
		// real adapter -- a fresh read confirms the persisted state the log describes.
		const found = await harness.hazardousEventRepository.findById(id, tenantId);
		expect(found.description).toBe("updated description");

		expect(logger.infoCalls).toHaveLength(2);
		expect(logger.infoCalls[0].msg).toBe("hazardous_event.updated");
		expect(logger.infoCalls[1]).toEqual({
			msg: "spatial_observation.recorded",
			hazardousEventId: id,
			tenantId,
			observationTime: observationTime.toISOString(),
		});

		await fs.rm(uploadRoot, { recursive: true, force: true });
	});

	// design.md Decision 17 (task 9d.12's real-rollback proof) -- stamp() runs inside the same tx
	// as the update, immediately after it; a failure there must roll back the update too.
	it("a stubbed rejection on IHipCrosswalkPort.stamp() leaves the HazardousEvent's prior field values intact", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const id = randomUUID();
		const uploadRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "delta-update-he-test-"),
		);
		const harness = createHarness(uploadRoot);

		await harness.hazardousEventRepository.insert(
			HazardousEvent.create(
				baseEventProps(id, tenantId, specificHazardId),
				new Set(),
				new Set(),
			),
		);
		await harness.workflowRepository.insert(
			WorkflowInstance.createDraft({
				id: randomUUID(),
				entityId: id,
				entityType: "HE",
				now: new Date("2026-01-01T00:00:00Z"),
			}),
		);

		vi.spyOn(harness.hipCrosswalkPort, "stamp").mockRejectedValueOnce(
			new Error("boom-stamp"),
		);

		await expect(
			harness.useCase.execute({
				id,
				tenantId,
				actingUserId: await seedUser(),
				description: "attempted new description",
			}),
		).rejects.toThrow("boom-stamp");

		const found = await harness.hazardousEventRepository.findById(id, tenantId);
		expect(found.description).toBe("original description");
		expect(await auditRowsFor(id)).toHaveLength(0);

		await fs.rm(uploadRoot, { recursive: true, force: true });
	});
});

// specs/shared-audit-log-port, specs/update-hazardous-event -- a successful update writes
// exactly one correctly-shaped audit_logs row (ca-shared-audit-log).
describe("UpdateHazardousEventUseCase audit log write (ca-shared-audit-log)", () => {
	it("writes exactly one audit_logs row with the pre-update row as oldValues and the post-update row as newValues", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const id = randomUUID();
		const actingUserId = await seedUser();
		const uploadRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "delta-update-he-test-"),
		);
		const harness = createHarness(uploadRoot);

		await harness.hazardousEventRepository.insert(
			HazardousEvent.create(
				baseEventProps(id, tenantId, specificHazardId),
				new Set(),
				new Set(),
			),
		);
		await harness.workflowRepository.insert(
			WorkflowInstance.createDraft({
				id: randomUUID(),
				entityId: id,
				entityType: "HE",
				now: new Date("2026-01-01T00:00:00Z"),
			}),
		);

		await harness.useCase.execute({
			id,
			tenantId,
			actingUserId,
			description: "updated description",
		});

		const rows = await auditRowsFor(id);
		expect(rows).toHaveLength(1);
		const [row] = rows;
		expect(row.tableName).toBe("hazardous_event");
		expect(row.userId).toBe(actingUserId);
		expect(row.action).toBe("Update hazardous event");
		expect(row.countryAccountsId).toBe(tenantId);
		expect((row.oldValues as { description: string }).description).toBe(
			"original description",
		);
		expect((row.newValues as { description: string }).description).toBe(
			"updated description",
		);

		await fs.rm(uploadRoot, { recursive: true, force: true });
	});
});

// ---------------------------------------------------------------------------
// tasks.md 4.3 / specs/ca-shared-attachments-module/specs/update-hazardous-event/spec.md --
// promote()/delete() wiring for File-type attachments on update. Each test gets its own
// mkdtemp uploadRoot (isolated from the real uploads/ tree and from every other test), per
// LocalDiskAttachmentStorageAdapter.test.ts's own convention.
// ---------------------------------------------------------------------------
describe("UpdateHazardousEventUseCase attachment promote/delete wiring (design.md Decision 7)", () => {
	let uploadRoot: string;

	beforeEach(async () => {
		uploadRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "delta-update-he-test-"),
		);
	});

	afterEach(async () => {
		await fs.rm(uploadRoot, { recursive: true, force: true });
	});

	it("A newly-added File-type attachment is promoted on update", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const id = randomUUID();
		const harness = createHarness(uploadRoot);

		await harness.hazardousEventRepository.insert(
			HazardousEvent.create(
				baseEventProps(id, tenantId, specificHazardId, { attachments: [] }),
				new Set(),
				new Set(),
			),
		);

		const staged = await harness.attachmentStoragePort.stage(tenantId, {
			name: "new.pdf",
			content: Buffer.from("x"),
		});
		const tempPath = path.join(
			uploadRoot,
			`tenant-${tenantId}`,
			"temp",
			staged.name,
		);
		// Non-vacuity guard: prove the staged file genuinely exists before the update, so the
		// "moved" assertion below can't pass simply because there was never anything to move.
		await expect(fs.stat(tempPath)).resolves.toBeDefined();

		await harness.useCase.execute({
			id,
			tenantId,
			actingUserId: await seedUser(),
			attachments: [
				{
					kind: "newFile",
					id: "a1",
					title: "New",
					tag: null,
					stagedFileName: staged.name,
					contentType: "application/pdf",
				},
			],
		});

		const found = await harness.hazardousEventRepository.findById(id, tenantId);
		expect(found.attachments).toHaveLength(1);
		const [attachment] = found.attachments;
		expect(attachment.type).toBe("File");
		expect(attachment.fileKey).toBe(staged.name);
		expect(attachment.fileName).toBe("new.pdf");
		expect(attachment.fileType).toBe("application/pdf");
		expect(attachment.fileSize).toBe(1);

		const permanentPath = permanentFilePath(
			uploadRoot,
			tenantId,
			id,
			attachment.fileKey as string,
		);
		await expect(fs.stat(permanentPath)).resolves.toBeDefined();
		await expect(fs.stat(tempPath)).rejects.toThrow();
	});

	it("Removing a File-type attachment deletes its on-disk file", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const id = randomUUID();
		const harness = createHarness(uploadRoot);

		// Genuinely promoted via the real adapter (not a hand-constructed fileKey) -- a stage()
		// + promote() pair, exactly as resolveAttachmentsForWrite's own "newFile" branch does it.
		const staged = await harness.attachmentStoragePort.stage(tenantId, {
			name: "to-remove.pdf",
			content: Buffer.from("y"),
		});
		const { fileKey, fileSize } = await harness.attachmentStoragePort.promote(
			{ tenantId, ownerType: "hazardous-event", ownerId: id },
			staged,
		);
		const permanentPath = permanentFilePath(uploadRoot, tenantId, id, fileKey);
		// Non-vacuity guard: the file must exist before the update for "deleted" to mean anything.
		await expect(fs.stat(permanentPath)).resolves.toBeDefined();

		await harness.hazardousEventRepository.insert(
			HazardousEvent.create(
				baseEventProps(id, tenantId, specificHazardId, {
					attachments: [
						fileAttachment({
							fileKey,
							fileName: "to-remove.pdf",
							fileType: "application/pdf",
							fileSize,
						}),
					],
				}),
				new Set(),
				new Set(),
			),
		);

		// Installed after seeding -- the seed's own promote() call above must not be counted.
		const deleteSpy = vi.spyOn(harness.attachmentStoragePort, "delete");

		await harness.useCase.execute({
			id,
			tenantId,
			actingUserId: await seedUser(),
			attachments: [],
		});

		const found = await harness.hazardousEventRepository.findById(id, tenantId);
		expect(found.attachments).toHaveLength(0);
		expect(deleteSpy).toHaveBeenCalledWith(
			{ tenantId, ownerType: "hazardous-event", ownerId: id },
			fileKey,
		);
		await expect(fs.stat(permanentPath)).rejects.toThrow();
	});

	it("Removing a Link-type attachment requires no file-storage call", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const id = randomUUID();
		const harness = createHarness(uploadRoot);

		await harness.hazardousEventRepository.insert(
			HazardousEvent.create(
				baseEventProps(id, tenantId, specificHazardId, {
					attachments: [linkAttachment()],
				}),
				new Set(),
				new Set(),
			),
		);

		const deleteSpy = vi.spyOn(harness.attachmentStoragePort, "delete");
		const promoteSpy = vi.spyOn(harness.attachmentStoragePort, "promote");

		await harness.useCase.execute({
			id,
			tenantId,
			actingUserId: await seedUser(),
			attachments: [],
		});

		const found = await harness.hazardousEventRepository.findById(id, tenantId);
		expect(found.attachments).toHaveLength(0);
		expect(deleteSpy).not.toHaveBeenCalled();
		expect(promoteSpy).not.toHaveBeenCalled();
	});

	it("An absent attachments field leaves existing files untouched", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const id = randomUUID();
		const harness = createHarness(uploadRoot);

		const staged = await harness.attachmentStoragePort.stage(tenantId, {
			name: "untouched.pdf",
			content: Buffer.from("z"),
		});
		const { fileKey, fileSize } = await harness.attachmentStoragePort.promote(
			{ tenantId, ownerType: "hazardous-event", ownerId: id },
			staged,
		);
		const permanentPath = permanentFilePath(uploadRoot, tenantId, id, fileKey);
		await expect(fs.stat(permanentPath)).resolves.toBeDefined();

		await harness.hazardousEventRepository.insert(
			HazardousEvent.create(
				baseEventProps(id, tenantId, specificHazardId, {
					attachments: [
						fileAttachment({
							fileKey,
							fileName: "untouched.pdf",
							fileType: "application/pdf",
							fileSize,
						}),
					],
				}),
				new Set(),
				new Set(),
			),
		);

		// Installed after seeding, so only this update's own calls (there should be none) count.
		const deleteSpy = vi.spyOn(harness.attachmentStoragePort, "delete");
		const promoteSpy = vi.spyOn(harness.attachmentStoragePort, "promote");

		// `attachments` key genuinely absent -- not `attachments: []` -- matching the command
		// field's `| undefined` optionality (design.md; UpdateHazardousEvent.ts's own
		// `command.attachments !== undefined` branch).
		await harness.useCase.execute({
			id,
			tenantId,
			actingUserId: await seedUser(),
			description: "a real field change, so the update genuinely writes a row",
		});

		const found = await harness.hazardousEventRepository.findById(id, tenantId);
		expect(found.description).toBe(
			"a real field change, so the update genuinely writes a row",
		);
		expect(found.attachments).toHaveLength(1);
		const [attachment] = found.attachments;
		// Decision 6: the repository mints a fresh UUID per attachment row on every update
		// (delete-and-reinsert), even when the attachment itself is carried over unchanged --
		// so the row's own `id` is deliberately not asserted here.
		expect(attachment.type).toBe("File");
		expect(attachment.fileKey).toBe(fileKey);
		expect(attachment.fileName).toBe("untouched.pdf");
		expect(attachment.fileType).toBe("application/pdf");
		expect(attachment.fileSize).toBe(fileSize);

		expect(deleteSpy).not.toHaveBeenCalled();
		expect(promoteSpy).not.toHaveBeenCalled();
		await expect(fs.stat(permanentPath)).resolves.toBeDefined();
	});
});
