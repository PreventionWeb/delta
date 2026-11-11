import "../../db/setup";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import { eventTable } from "~/drizzle/schema/eventTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { DrizzleTransactionRunner } from "~/infrastructure/DrizzleTransactionRunner.server";
import { DrizzleHazardousEventRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server";
import { DrizzleCausalChainRepository } from "~/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server";
import { DrizzleEventCausalityRepository } from "~/domains/event-causality/infrastructure/DrizzleEventCausalityRepository.server";
import { DrizzleWorkflowRepository } from "~/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server";
import { DeleteWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/DeleteWorkflowInstance";
import { WorkflowInstance } from "~/domains/validation-workflow/domain/WorkflowInstance";
import {
	HazardousEvent,
	type HazardousEventAttachmentProps,
	type HazardousEventProps,
} from "~/domains/hazardous-events/domain/HazardousEvent";
import { hazardousEventAttachmentTable } from "~/domains/hazardous-events/infrastructure/hazardousEventAttachmentTable";
import { DeleteHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/DeleteHazardousEvent";
import { LocalDiskAttachmentStorageAdapter } from "~/domains/shared/attachments/infrastructure/LocalDiskAttachmentStorageAdapter.server";
import { ConflictError, NotFoundError } from "~/shared/errors";
import type { ILogger } from "~/shared/logging/ILogger";
import {
	seedCountryAccount,
	seedSpecificHazard,
} from "../../db/models/hazardousEventTestHelpers";

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

interface Harness {
	useCase: DeleteHazardousEventUseCase;
	hazardousEventRepository: DrizzleHazardousEventRepository;
	workflowRepository: DrizzleWorkflowRepository;
	logger: RecordingLogger;
}

// Per-test temp upload root, shared by seedEventWithWorkflow and direct stage/promote calls.
let tempRoot: string;
let attachmentStoragePort: LocalDiskAttachmentStorageAdapter;

beforeEach(() => {
	tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "delta-delete-he-test-"));
	attachmentStoragePort = new LocalDiskAttachmentStorageAdapter(tempRoot);
});

afterEach(() => {
	fs.rmSync(tempRoot, { recursive: true, force: true });
});

/** Adapter's own on-disk layout -- for real-disk assertions only, never to bypass the port. */
function promotedFilePath(
	tenantId: string,
	ownerId: string,
	fileKey: string,
): string {
	return path.join(
		tempRoot,
		`tenant-${tenantId}`,
		"hazardous-event",
		ownerId,
		fileKey,
	);
}

/** Genuinely stages+promotes a file via the real adapter; `ownerId` must be the event id it'll be inserted under. */
async function promoteFileAttachment(
	tenantId: string,
	ownerId: string,
	fileName = "report.pdf",
): Promise<HazardousEventAttachmentProps> {
	const staged = await attachmentStoragePort.stage(tenantId, {
		name: fileName,
		content: Buffer.from(`real content for ${fileName}`),
	});
	const { fileKey, fileSize } = await attachmentStoragePort.promote(
		{ tenantId, ownerType: "hazardous-event", ownerId },
		staged,
	);
	return {
		id: randomUUID(),
		title: "Attachment",
		type: "File",
		url: null,
		tag: null,
		fileKey,
		fileName,
		fileType: "application/pdf",
		fileSize,
	};
}

async function seedEventWithWorkflow(
	options: {
		id?: string;
		tenantId?: string;
		attachments?: readonly HazardousEventAttachmentProps[];
	} = {},
): Promise<{
	id: string;
	tenantId: string;
	harness: Harness;
}> {
	const tenantId = options.tenantId ?? ((await seedCountryAccount()) as string);
	const specificHazardId = await seedSpecificHazard();
	const id = options.id ?? randomUUID();
	const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
	const workflowRepository = new DrizzleWorkflowRepository(dr);
	const causalChainRepository = new DrizzleCausalChainRepository(dr);
	const eventCausalityRepository = new DrizzleEventCausalityRepository(dr);
	const transactionRunner = new DrizzleTransactionRunner(dr);
	const logger = new RecordingLogger();

	await hazardousEventRepository.insert(
		HazardousEvent.create(
			{
				...baseEventProps(id, tenantId, specificHazardId),
				attachments: options.attachments ?? [],
			},
			new Set(),
			new Set(),
		),
	);
	await workflowRepository.insert(
		WorkflowInstance.createDraft({
			id: randomUUID(),
			entityId: id,
			entityType: "HE",
			now: new Date("2026-01-01T00:00:00Z"),
		}),
	);

	const useCase = new DeleteHazardousEventUseCase(
		logger,
		hazardousEventRepository,
		eventCausalityRepository,
		causalChainRepository,
		new DeleteWorkflowInstanceUseCase(workflowRepository),
		transactionRunner,
		attachmentStoragePort,
	);

	return {
		id,
		tenantId,
		harness: { useCase, hazardousEventRepository, workflowRepository, logger },
	};
}

describe("DeleteHazardousEventUseCase against real adapters (DEF-033 lock proof)", () => {
	it("two concurrent execute() calls for the same zero-dependent event: one commits and logs once, the other no-ops with no log", async () => {
		const { id, tenantId, harness } = await seedEventWithWorkflow();

		const outcomes = await Promise.allSettled([
			harness.useCase.execute({ id, tenantId, actingUserId: "user-1" }),
			harness.useCase.execute({ id, tenantId, actingUserId: "user-2" }),
		]);

		expect(outcomes[0].status).toBe("fulfilled");
		expect(outcomes[1].status).toBe("fulfilled");
		expect(harness.logger.infoCalls).toHaveLength(1);
		await expect(
			harness.hazardousEventRepository.findById(id, tenantId),
		).rejects.toThrow(NotFoundError);
	});

	it("a dependent inserted and committed before the lock is acquired blocks the delete with ConflictError, exactly as today", async () => {
		const { id, tenantId, harness } = await seedEventWithWorkflow();
		const [event] = await dr
			.insert(eventTable)
			.values({})
			.returning({ id: eventTable.id });
		await dr.insert(disasterEventTable).values({
			id: event.id,
			hazardousEventId: id,
			countryAccountsId: tenantId,
		});

		await expect(
			harness.useCase.execute({ id, tenantId, actingUserId: "user-1" }),
		).rejects.toThrow(ConflictError);
	});

	// The full lock scenario -- a concurrent insert blocks until the lock-holding transaction
	// ends, then fails with a foreign-key violation once the row is actually deleted -- is
	// proven against findByIdForUpdate/delete directly in DrizzleHazardousEventRepository.test.ts
	// (Task 3.3); not duplicated here.

	it("a sequential second execute(), made only after the first call's transaction has already fully committed, still throws NotFoundError from findById", async () => {
		const { id, tenantId, harness } = await seedEventWithWorkflow();

		await harness.useCase.execute({ id, tenantId, actingUserId: "user-1" });

		await expect(
			harness.useCase.execute({ id, tenantId, actingUserId: "user-2" }),
		).rejects.toThrow(NotFoundError);
	});

	// DEF-031: a failure must not leave a HazardousEvent with no WorkflowInstance.
	it("a stubbed rejection on deleteByEntity leaves both the HazardousEvent row and its WorkflowInstance intact", async () => {
		const { id, tenantId, harness } = await seedEventWithWorkflow();
		vi.spyOn(
			harness.workflowRepository,
			"deleteByEntity",
		).mockRejectedValueOnce(new Error("boom-delete-by-entity"));

		await expect(
			harness.useCase.execute({ id, tenantId, actingUserId: "user-1" }),
		).rejects.toThrow("boom-delete-by-entity");

		await expect(
			harness.hazardousEventRepository.findById(id, tenantId),
		).resolves.toBeDefined();
		await expect(
			harness.workflowRepository.findByEntity(id, "HE"),
		).resolves.not.toBeNull();
		expect(harness.logger.infoCalls).toHaveLength(0);
	});

	// Proves tx threading for a failure *after* deleteByEntity — the test above only stubs
	// deleteByEntity itself, which can't catch this (design.md "Atomicity" section).
	it("a stubbed rejection on delete, after deleteByEntity has already run, leaves both the HazardousEvent row and its WorkflowInstance intact", async () => {
		const { id, tenantId, harness } = await seedEventWithWorkflow();
		vi.spyOn(harness.hazardousEventRepository, "delete").mockRejectedValueOnce(
			new Error("boom-hazardous-event-delete"),
		);

		await expect(
			harness.useCase.execute({ id, tenantId, actingUserId: "user-1" }),
		).rejects.toThrow("boom-hazardous-event-delete");

		await expect(
			harness.workflowRepository.findByEntity(id, "HE"),
		).resolves.not.toBeNull();
		await expect(
			harness.hazardousEventRepository.findById(id, tenantId),
		).resolves.toBeDefined();
	});
});

// ca-shared-attachments-module, design.md Decision 8 / specs/delete-hazardous-event/spec.md.
describe("DeleteHazardousEventUseCase attachment file cleanup (ca-shared-attachments-module)", () => {
	it("deleting an event with File-type attachments deletes their files", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const id = randomUUID();
		const attachment = await promoteFileAttachment(tenantId, id);
		const filePath = promotedFilePath(
			tenantId,
			id,
			attachment.fileKey as string,
		);
		expect(fs.existsSync(filePath)).toBe(true);

		const { harness } = await seedEventWithWorkflow({
			id,
			tenantId,
			attachments: [attachment],
		});

		await harness.useCase.execute({ id, tenantId, actingUserId: "user-1" });

		await expect(
			harness.hazardousEventRepository.findById(id, tenantId),
		).rejects.toThrow(NotFoundError);
		const attachmentRows = await dr
			.select()
			.from(hazardousEventAttachmentTable)
			.where(eq(hazardousEventAttachmentTable.hazardousEventId, id));
		expect(attachmentRows).toHaveLength(0);
		expect(fs.existsSync(filePath)).toBe(false);
	});

	it("deleting an event with only Link-type attachments requires no file-storage call", async () => {
		const deleteSpy = vi.spyOn(attachmentStoragePort, "delete");
		const { id, tenantId, harness } = await seedEventWithWorkflow({
			attachments: [
				{
					id: randomUUID(),
					title: "Link attachment",
					type: "Link",
					url: "https://example.com/resource",
					tag: null,
					fileKey: null,
					fileName: null,
					fileType: null,
					fileSize: null,
				},
			],
		});

		await harness.useCase.execute({ id, tenantId, actingUserId: "user-1" });

		await expect(
			harness.hazardousEventRepository.findById(id, tenantId),
		).rejects.toThrow(NotFoundError);
		expect(deleteSpy).not.toHaveBeenCalled();
	});

	it("a blocked delete (dependents exist) does not delete any attachment file", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const id = randomUUID();
		const attachment = await promoteFileAttachment(tenantId, id, "blocked.pdf");
		const filePath = promotedFilePath(
			tenantId,
			id,
			attachment.fileKey as string,
		);

		const { harness } = await seedEventWithWorkflow({
			id,
			tenantId,
			attachments: [attachment],
		});
		const [event] = await dr
			.insert(eventTable)
			.values({})
			.returning({ id: eventTable.id });
		await dr.insert(disasterEventTable).values({
			id: event.id,
			hazardousEventId: id,
			countryAccountsId: tenantId,
		});

		await expect(
			harness.useCase.execute({ id, tenantId, actingUserId: "user-1" }),
		).rejects.toThrow(ConflictError);

		const attachmentRows = await dr
			.select()
			.from(hazardousEventAttachmentTable)
			.where(eq(hazardousEventAttachmentTable.hazardousEventId, id));
		expect(attachmentRows).toHaveLength(1);
		expect(fs.existsSync(filePath)).toBe(true);
	});
});
