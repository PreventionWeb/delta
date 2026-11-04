import "../../db/setup";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { dr } from "~/db.server";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
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
import type { ILogger } from "~/shared/logging/ILogger";
import {
	seedCountryAccount,
	seedSpecificHazard,
} from "../../db/models/hazardousEventTestHelpers";

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
				actingUserId: randomUUID(),
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
				actingUserId: randomUUID(),
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
				actingUserId: randomUUID(),
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
				actingUserId: randomUUID(),
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
	});
});
