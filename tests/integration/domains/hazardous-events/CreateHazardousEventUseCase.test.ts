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
import { DrizzleWorkflowRepository } from "~/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server";
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
		const useCase = new CreateHazardousEventUseCase(
			new NoOpLogger(),
			taxonomyRepository,
			hazardousEventRepository,
			workflowRepository,
			causalChainRepository,
			transactionRunner,
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

		const useCase = new CreateHazardousEventUseCase(
			new NoOpLogger(),
			taxonomyRepository,
			hazardousEventRepository,
			workflowRepository,
			causalChainRepository,
			transactionRunner,
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
	});
});
