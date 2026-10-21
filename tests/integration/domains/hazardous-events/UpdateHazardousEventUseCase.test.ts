import "../../db/setup";
import { randomUUID } from "crypto";
import { describe, expect, it, vi } from "vitest";
import { dr } from "~/db.server";
import { DrizzleTransactionRunner } from "~/infrastructure/DrizzleTransactionRunner.server";
import { DrizzleHazardousEventRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server";
import { DrizzleCausalChainRepository } from "~/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server";
import { DrizzleHazardTaxonomyRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardTaxonomyRepository.server";
import { DrizzleWorkflowRepository } from "~/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server";
import { WorkflowInstance } from "~/domains/validation-workflow/domain/WorkflowInstance";
import {
	HazardousEvent,
	type HazardousEventProps,
} from "~/domains/hazardous-events/domain/HazardousEvent";
import { UpdateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent";
import { ConflictError } from "~/shared/errors";
import type { ILogger } from "~/shared/logging/ILogger";
import {
	seedCountryAccount,
	seedSpecificHazard,
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
	};
}

describe("UpdateHazardousEventUseCase against real adapters (DEF-026 rollback proof)", () => {
	it("a stubbed ConflictError from the delegated spatial-observation call leaves the HazardousEvent's prior field values intact", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const id = randomUUID();
		const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
		const workflowRepository = new DrizzleWorkflowRepository(dr);
		const causalChainRepository = new DrizzleCausalChainRepository(dr);
		const taxonomyRepository = new DrizzleHazardTaxonomyRepository(dr);
		const transactionRunner = new DrizzleTransactionRunner(dr);

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

		const recordSpatialObservationUseCase = {
			execute: vi
				.fn()
				.mockRejectedValue(new ConflictError("duplicate observationTime", {})),
		};
		const useCase = new UpdateHazardousEventUseCase(
			new NoOpLogger(),
			taxonomyRepository,
			hazardousEventRepository,
			workflowRepository,
			causalChainRepository,
			recordSpatialObservationUseCase,
			transactionRunner,
		);

		await expect(
			useCase.execute({
				id,
				tenantId,
				actingUserId: randomUUID(),
				description: "attempted new description",
				spatialObservation: { geometries: [], divisionIds: [] },
			}),
		).rejects.toThrow(ConflictError);

		const found = await hazardousEventRepository.findById(id, tenantId);
		expect(found.description).toBe("original description");
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
		const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
		const workflowRepository = new DrizzleWorkflowRepository(dr);
		const causalChainRepository = new DrizzleCausalChainRepository(dr);
		const taxonomyRepository = new DrizzleHazardTaxonomyRepository(dr);
		const transactionRunner = new DrizzleTransactionRunner(dr);

		await hazardousEventRepository.insert(
			HazardousEvent.create(
				{
					...baseEventProps(effectId, tenantId, specificHazardId),
					startDate: "2026-06-01",
				},
				new Set(),
				new Set(),
			),
		);
		await workflowRepository.insert(
			WorkflowInstance.createDraft({
				id: randomUUID(),
				entityId: effectId,
				entityType: "HE",
				now: new Date("2026-01-01T00:00:00Z"),
			}),
		);
		await hazardousEventRepository.insert(
			HazardousEvent.create(
				{
					...baseEventProps(priorCauseId, tenantId, specificHazardId),
					startDate: "2026-01-01",
				},
				new Set(),
				new Set(),
			),
		);
		await hazardousEventRepository.insert(
			HazardousEvent.create(
				{
					...baseEventProps(newCauseId, tenantId, specificHazardId),
					startDate: "2026-02-01",
				},
				new Set(),
				new Set(),
			),
		);
		await causalChainRepository.saveEdge(
			{ causeId: priorCauseId, effectId },
			null,
		);

		const recordSpatialObservationUseCase = {
			execute: vi.fn(),
		};
		const useCase = new UpdateHazardousEventUseCase(
			new NoOpLogger(),
			taxonomyRepository,
			hazardousEventRepository,
			workflowRepository,
			causalChainRepository,
			recordSpatialObservationUseCase,
			transactionRunner,
		);
		vi.spyOn(causalChainRepository, "replaceCauseEdge").mockRejectedValueOnce(
			new Error("boom-replace-cause-edge"),
		);

		await expect(
			useCase.execute({
				id: effectId,
				tenantId,
				actingUserId: randomUUID(),
				description: "attempted new description",
				causeId: newCauseId,
			}),
		).rejects.toThrow("boom-replace-cause-edge");

		const found = await hazardousEventRepository.findById(effectId, tenantId);
		expect(found.description).toBe("original description");
		const edgesFromPriorCause =
			await causalChainRepository.findReachableEdgesFrom(priorCauseId);
		expect(edgesFromPriorCause).toContainEqual({
			causeId: priorCauseId,
			effectId,
		});
		const edgesFromNewCause =
			await causalChainRepository.findReachableEdgesFrom(newCauseId);
		expect(edgesFromNewCause).toEqual([]);
	});

	// Migrated from RecordSpatialObservation.test.ts (design.md Decision 6 addendum) --
	// RecordSpatialObservationUseCase no longer logs its own success; this use case, its only
	// current caller, does so itself, after its own outer transaction has actually committed
	// against the real adapter (not just after a fake's trivial await).
	it("logs spatial_observation.recorded, after the real transaction has committed, when a spatial observation is bundled", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const id = randomUUID();
		const hazardousEventRepository = new DrizzleHazardousEventRepository(dr);
		const workflowRepository = new DrizzleWorkflowRepository(dr);
		const causalChainRepository = new DrizzleCausalChainRepository(dr);
		const taxonomyRepository = new DrizzleHazardTaxonomyRepository(dr);
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

		const observationTime = new Date("2026-03-01T00:00:00.000Z");
		const recordSpatialObservationUseCase = {
			execute: vi.fn().mockResolvedValue({
				id: randomUUID(),
				hazardousEventId: id,
				observationTime: observationTime.toISOString(),
				note: null,
				geometries: [],
				divisionIds: [],
				createdAt: observationTime.toISOString(),
				updatedAt: observationTime.toISOString(),
			}),
		};
		const useCase = new UpdateHazardousEventUseCase(
			logger,
			taxonomyRepository,
			hazardousEventRepository,
			workflowRepository,
			causalChainRepository,
			recordSpatialObservationUseCase,
			transactionRunner,
		);

		await useCase.execute({
			id,
			tenantId,
			actingUserId: randomUUID(),
			description: "updated description",
			spatialObservation: { observationTime, geometries: [], divisionIds: [] },
		});

		// By the time this call returns, the transaction has genuinely committed against the
		// real adapter -- a fresh read confirms the persisted state the log describes.
		const found = await hazardousEventRepository.findById(id, tenantId);
		expect(found.description).toBe("updated description");

		expect(logger.infoCalls).toHaveLength(2);
		expect(logger.infoCalls[0].msg).toBe("hazardous_event.updated");
		expect(logger.infoCalls[1]).toEqual({
			msg: "spatial_observation.recorded",
			hazardousEventId: id,
			tenantId,
			observationTime: observationTime.toISOString(),
		});
	});
});
