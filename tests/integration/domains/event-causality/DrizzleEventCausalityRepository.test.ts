import "../../db/setup";
import { describe, expect, it } from "vitest";
import { dr } from "~/db.server";
import { eventTable } from "~/drizzle/schema/eventTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { eventCausalityTable } from "~/drizzle/schema/eventCausalityTable";
import { DrizzleEventCausalityRepository } from "~/domains/event-causality/infrastructure/DrizzleEventCausalityRepository.server";
import {
	seedCountryAccount,
	seedHazardousEvent,
} from "../../db/models/hazardousEventTestHelpers";

/** Mirrors the local helper in hazardousEventDisasterEventBoundary.test.ts. */
async function seedDisasterEvent(countryAccountsId: string | null) {
	const [de] = await dr
		.insert(eventTable)
		.values({ name: "DE", description: "DE" })
		.returning({ id: eventTable.id });
	await dr.insert(disasterEventTable).values({ id: de.id, countryAccountsId });
	return de.id;
}

describe("DrizzleEventCausalityRepository.countReferences", () => {
	const repository = new DrizzleEventCausalityRepository(dr);

	it("resolves zero for both counts when no event_causality row references the hazardous event", async () => {
		const { id: hazardousEventId, countryAccountsId: tenantId } =
			await seedHazardousEvent();

		await expect(
			repository.countReferences(hazardousEventId, tenantId),
		).resolves.toEqual({ sameTenantCount: 0, crossTenantCount: 0 });
	});

	it("counts a same-tenant reference with the hazardous event as the triggering side", async () => {
		const { id: hazardousEventId, countryAccountsId: tenantId } =
			await seedHazardousEvent();
		const disasterEventId = await seedDisasterEvent(tenantId);
		await dr.insert(eventCausalityTable).values({
			triggeringEntityType: "HE",
			triggeringHazardousEventId: hazardousEventId,
			triggeredEntityType: "DE",
			triggeredDisasterEventId: disasterEventId,
		});

		await expect(
			repository.countReferences(hazardousEventId, tenantId),
		).resolves.toEqual({ sameTenantCount: 1, crossTenantCount: 0 });
	});

	it("counts a same-tenant reference with the hazardous event as the triggered side", async () => {
		const { id: hazardousEventId, countryAccountsId: tenantId } =
			await seedHazardousEvent();
		const disasterEventId = await seedDisasterEvent(tenantId);
		await dr.insert(eventCausalityTable).values({
			triggeringEntityType: "DE",
			triggeringDisasterEventId: disasterEventId,
			triggeredEntityType: "HE",
			triggeredHazardousEventId: hazardousEventId,
		});

		await expect(
			repository.countReferences(hazardousEventId, tenantId),
		).resolves.toEqual({ sameTenantCount: 1, crossTenantCount: 0 });
	});

	it("counts a cross-tenant reference in crossTenantCount, not excluded", async () => {
		const { id: hazardousEventId, countryAccountsId: tenantId } =
			await seedHazardousEvent();
		const foreignTenantId = await seedCountryAccount();
		const disasterEventId = await seedDisasterEvent(foreignTenantId);
		await dr.insert(eventCausalityTable).values({
			triggeringEntityType: "HE",
			triggeringHazardousEventId: hazardousEventId,
			triggeredEntityType: "DE",
			triggeredDisasterEventId: disasterEventId,
		});

		await expect(
			repository.countReferences(hazardousEventId, tenantId),
		).resolves.toEqual({ sameTenantCount: 0, crossTenantCount: 1 });
	});

	it("counts a same-tenant row and a cross-tenant row independently when both are present", async () => {
		const { id: hazardousEventId, countryAccountsId: tenantId } =
			await seedHazardousEvent();
		const sameTenantDisasterEventId = await seedDisasterEvent(tenantId);
		const foreignTenantId = await seedCountryAccount();
		const crossTenantDisasterEventId = await seedDisasterEvent(foreignTenantId);
		await dr.insert(eventCausalityTable).values([
			{
				triggeringEntityType: "HE",
				triggeringHazardousEventId: hazardousEventId,
				triggeredEntityType: "DE",
				triggeredDisasterEventId: sameTenantDisasterEventId,
			},
			{
				triggeringEntityType: "HE",
				triggeringHazardousEventId: hazardousEventId,
				triggeredEntityType: "DE",
				triggeredDisasterEventId: crossTenantDisasterEventId,
			},
		]);

		await expect(
			repository.countReferences(hazardousEventId, tenantId),
		).resolves.toEqual({ sameTenantCount: 1, crossTenantCount: 1 });
	});

	it("counts both directions — a triggering-side row and a distinct triggered-side row — neither skipped", async () => {
		const { id: hazardousEventId, countryAccountsId: tenantId } =
			await seedHazardousEvent();
		const triggeredSideDisasterEventId = await seedDisasterEvent(tenantId);
		const triggeringSideDisasterEventId = await seedDisasterEvent(tenantId);
		await dr.insert(eventCausalityTable).values([
			{
				triggeringEntityType: "HE",
				triggeringHazardousEventId: hazardousEventId,
				triggeredEntityType: "DE",
				triggeredDisasterEventId: triggeredSideDisasterEventId,
			},
			{
				triggeringEntityType: "DE",
				triggeringDisasterEventId: triggeringSideDisasterEventId,
				triggeredEntityType: "HE",
				triggeredHazardousEventId: hazardousEventId,
			},
		]);

		const result = await repository.countReferences(hazardousEventId, tenantId);

		expect(result).toEqual({ sameTenantCount: 2, crossTenantCount: 0 });
		// Guards a regression to Postgres's bigint COUNT surfacing as a string.
		expect(typeof result.sameTenantCount).toBe("number");
		expect(typeof result.crossTenantCount).toBe("number");
	});

	it("counts a distinct HE-to-HE causality row from each side, resolving the true other event's tenant rather than the queried event's own tenant", async () => {
		// Unlike the self-referencing scenarios below, triggering and triggered here are two
		// different hazardous events, so an aliasing bug (e.g. triggeringHe/triggeredHe swapped)
		// would resolve the queried event's own tenant instead of the other event's, and this would
		// go undetected by a self-reference test where both aliases point at the same row.
		const {
			id: triggeringHazardousEventId,
			countryAccountsId: triggeringTenantId,
		} = await seedHazardousEvent();
		const foreignTenantId = await seedCountryAccount();
		const { id: triggeredHazardousEventId } = await seedHazardousEvent({
			countryAccountsId: foreignTenantId,
		});
		await dr.insert(eventCausalityTable).values({
			triggeringEntityType: "HE",
			triggeringHazardousEventId,
			triggeredEntityType: "HE",
			triggeredHazardousEventId,
		});

		await expect(
			repository.countReferences(
				triggeringHazardousEventId,
				triggeringTenantId,
			),
		).resolves.toEqual({ sameTenantCount: 0, crossTenantCount: 1 });
		await expect(
			repository.countReferences(triggeredHazardousEventId, foreignTenantId),
		).resolves.toEqual({ sameTenantCount: 0, crossTenantCount: 1 });
	});

	describe("a row referencing the hazardous event on both its triggering and triggered side", () => {
		it("counts exactly once, classified same-tenant when queried with the event's own tenant", async () => {
			const { id: hazardousEventId, countryAccountsId: tenantId } =
				await seedHazardousEvent();
			await dr.insert(eventCausalityTable).values({
				triggeringEntityType: "HE",
				triggeringHazardousEventId: hazardousEventId,
				triggeredEntityType: "HE",
				triggeredHazardousEventId: hazardousEventId,
			});

			await expect(
				repository.countReferences(hazardousEventId, tenantId),
			).resolves.toEqual({ sameTenantCount: 1, crossTenantCount: 0 });
		});

		it("counts exactly once, classified cross-tenant when queried with a different tenant", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();
			const differentTenantId = await seedCountryAccount();
			await dr.insert(eventCausalityTable).values({
				triggeringEntityType: "HE",
				triggeringHazardousEventId: hazardousEventId,
				triggeredEntityType: "HE",
				triggeredHazardousEventId: hazardousEventId,
			});

			await expect(
				repository.countReferences(hazardousEventId, differentTenantId),
			).resolves.toEqual({ sameTenantCount: 0, crossTenantCount: 1 });
		});
	});

	it("counts a row whose other side has no recorded tenant (NULL) in crossTenantCount, never excluded from both counts", async () => {
		const { id: hazardousEventId, countryAccountsId: tenantId } =
			await seedHazardousEvent();
		const noTenantDisasterEventId = await seedDisasterEvent(null);
		await dr.insert(eventCausalityTable).values({
			triggeringEntityType: "HE",
			triggeringHazardousEventId: hazardousEventId,
			triggeredEntityType: "DE",
			triggeredDisasterEventId: noTenantDisasterEventId,
		});

		await expect(
			repository.countReferences(hazardousEventId, tenantId),
		).resolves.toEqual({ sameTenantCount: 0, crossTenantCount: 1 });
	});
});
