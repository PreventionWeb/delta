import "../../db/setup";
import "reflect-metadata";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { HazardousEventsModule } from "~/domains/hazardous-events/infrastructure/HazardousEventsModule.server";
import { CreateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/CreateHazardousEvent";
import { queryLinkedHazardousEventOptions } from "~/backend.server/services/disaster-event/linkedHazardousEventOptions";
import {
	seedCountryAccount,
	seedSpecificHazardWithHipCrosswalk,
} from "../../db/models/hazardousEventTestHelpers";

// design.md Decision 17's own "Verification requirement" -- an end-to-end scenario against the
// real, UNMODIFIED linkedHazardousEventOptions consumer (Disaster Events' own hazardous-event
// link picker), proving the "zero consumer changes needed" claim empirically. This test MUST
// fail against the pre-9d.6 code (a CA-created event's displayName is blank) and pass once the
// CreateHazardousEventUseCase -> IHipCrosswalkPort composition is in -- confirmed by temporarily
// commenting out the stamp() call in CreateHazardousEvent.ts and re-running this file, which
// reproduced exactly that failure (empty name) before being restored.
describe("queryLinkedHazardousEventOptions against a CA-created event (design.md Decision 17, task 9d.13)", () => {
	it("resolves a non-blank name for a CA-created event whose full taxonomy ancestor chain has valid, live sourceRefIds", async () => {
		const testingModule: TestingModule = await Test.createTestingModule({
			imports: [HazardousEventsModule],
		}).compile();

		const tenantId = (await seedCountryAccount()) as string;
		const { specificHazardId } = await seedSpecificHazardWithHipCrosswalk();
		const createHazardousEventUseCase = testingModule.get(
			CreateHazardousEventUseCase,
		);

		const created = await createHazardousEventUseCase.execute({
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
		});

		const options = await queryLinkedHazardousEventOptions(tenantId, "en", []);

		const option = options.find((o) => o.id === created.id);
		expect(option).toBeDefined();
		// seedHipChain() names the seeded hip_hazard row "Test Hazard" (en) -- the hazard level,
		// not a cluster/type fallback, confirming the full chain resolved end to end.
		expect(option?.name).toBe("Test Hazard");

		await testingModule.close();
	});
});
