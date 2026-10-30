import "../../db/setup";
import { randomUUID } from "crypto";
import { describe, expect, it, vi } from "vitest";
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
	type HazardousEventProps,
} from "~/domains/hazardous-events/domain/HazardousEvent";
import { DeleteHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/DeleteHazardousEvent";
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

async function seedEventWithWorkflow(): Promise<{
	id: string;
	tenantId: string;
	harness: Harness;
}> {
	const tenantId = (await seedCountryAccount()) as string;
	const specificHazardId = await seedSpecificHazard();
	const id = randomUUID();
	const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
	const workflowRepository = new DrizzleWorkflowRepository(dr);
	const causalChainRepository = new DrizzleCausalChainRepository(dr);
	const eventCausalityRepository = new DrizzleEventCausalityRepository(dr);
	const transactionRunner = new DrizzleTransactionRunner(dr);
	const logger = new RecordingLogger();

	await hazardousEventRepository.insert(
		HazardousEvent.create(
			baseEventProps(id, tenantId, specificHazardId),
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
