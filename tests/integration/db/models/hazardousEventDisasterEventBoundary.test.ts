// Phase 0f characterization tests — cross-boundary behavior between Hazardous Events and
// Disaster Events. See _docs/refactoring-plan/hazardous-events-phase0-audit-findings.md.
import "../setup";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { eq } from "drizzle-orm";
import { eventTable } from "../testSchema/eventTable";
import { disasterEventTable } from "../testSchema/disasterEventTable";
import { eventCausalityTable } from "../testSchema/eventCausalityTable";
import { HazardousEventRepository } from "~/db/queries/hazardousEventRepository";
import { EventCausalityRepository } from "~/db/queries/eventCausalityRepository";
import {
	seedCountryAccount,
	seedHazardousEvent,
} from "./hazardousEventTestHelpers";

async function seedDisasterEvent(countryAccountsId: string) {
	const [de] = await dr
		.insert(eventTable)
		.values({ name: "DE", description: "DE" })
		.returning({ id: eventTable.id });
	await dr.insert(disasterEventTable).values({ id: de.id, countryAccountsId });
	return de.id;
}

describe("event_causality — cross-tenant HE linking on the DE edit page", () => {
	it("BUG: createMany accepts a triggering hazardous event from a foreign tenant with no validation, unlike disasterEventCreate/Update's own hazardousEventId guard", async () => {
		// disasterEventCreate (event.ts ~1825) and disasterEventUpdate (~1971) both reject a
		// foreign-tenant fields.hazardousEventId with "hazardous_event.cannot_reference_other_tenant".
		// syncLinkedHazardousEvents (edit.$id.tsx ~901), which writes event_causality rows for the
		// linkedTriggeringHazardousEventIds/linkedTriggeredHazardousEventIds arrays, has no such
		// check anywhere between parsing the form data (~448-549) and calling this repository —
		// the same tenant boundary the app deliberately guards for the singular field is open here.
		const deTenant = await seedCountryAccount();
		const deId = await seedDisasterEvent(deTenant);
		const foreignHe = await seedHazardousEvent();

		const [row] = await EventCausalityRepository.createMany([
			{
				triggeringEntityType: "HE",
				triggeringHazardousEventId: foreignHe.id,
				triggeredEntityType: "DE",
				triggeredDisasterEventId: deId,
			},
		]);
		expect(row.triggeringHazardousEventId).toBe(foreignHe.id); // no rejection, no tenant check

		const linked =
			await EventCausalityRepository.getLinkedHazardousEventIds(deId);
		expect(linked.linkedTriggeringHazardousEventIds).toContain(foreignHe.id);
	});
});

describe("HazardousEventRepository.getLinkableOptionsData — DE-side linking picker", () => {
	it("only returns events from the requested tenant", async () => {
		const ownTenant = await seedCountryAccount();
		const own = await seedHazardousEvent({ countryAccountsId: ownTenant });
		await seedHazardousEvent(); // foreign tenant

		const res =
			await HazardousEventRepository.getLinkableOptionsData(ownTenant);
		const ids = res.hazardousEvents.map((e) => e.id);
		expect(ids).toContain(own.id);
		expect(ids).toHaveLength(1);
	});

	it("excludes ids passed via blockedHazardousIds (the opposite-direction / already-linked filter)", async () => {
		const ownTenant = await seedCountryAccount();
		const visible = await seedHazardousEvent({ countryAccountsId: ownTenant });
		const blocked = await seedHazardousEvent({ countryAccountsId: ownTenant });

		const res = await HazardousEventRepository.getLinkableOptionsData(
			ownTenant,
			[blocked.id],
		);
		const ids = res.hazardousEvents.map((e) => e.id);
		expect(ids).toContain(visible.id);
		expect(ids).not.toContain(blocked.id);
	});

	it("QUIRK: silently truncates at 200 with no search term and no offset — events beyond the cap are simply invisible", async () => {
		const ownTenant = await seedCountryAccount();
		for (let i = 0; i < 201; i++) {
			await seedHazardousEvent({ countryAccountsId: ownTenant });
		}

		const res =
			await HazardousEventRepository.getLinkableOptionsData(ownTenant);
		expect(res.hazardousEvents).toHaveLength(200); // 1 record invisible, no pagination offered
	});
});

describe("EventCausalityRepository.getLinkedHazardousEventIds — DE edit page's current-links read", () => {
	it("splits triggering vs triggered ids by direction, matching syncLinkedHazardousEvents's own diff query", async () => {
		const deTenant = await seedCountryAccount();
		const deId = await seedDisasterEvent(deTenant);
		const triggering = await seedHazardousEvent({
			countryAccountsId: deTenant,
		});
		const triggered = await seedHazardousEvent({ countryAccountsId: deTenant });

		await dr.insert(eventCausalityTable).values([
			{
				triggeringEntityType: "HE",
				triggeringHazardousEventId: triggering.id,
				triggeredEntityType: "DE",
				triggeredDisasterEventId: deId,
			},
			{
				triggeringEntityType: "DE",
				triggeringDisasterEventId: deId,
				triggeredEntityType: "HE",
				triggeredHazardousEventId: triggered.id,
			},
		]);

		const linked =
			await EventCausalityRepository.getLinkedHazardousEventIds(deId);
		expect(linked.linkedTriggeringHazardousEventIds).toEqual([triggering.id]);
		expect(linked.linkedTriggeredHazardousEventIds).toEqual([triggered.id]);
	});

	it("QUIRK: is NOT blocked when the linked HE row is cascade-deleted — the causality row itself vanishes", async () => {
		const deTenant = await seedCountryAccount();
		const deId = await seedDisasterEvent(deTenant);
		const he = await seedHazardousEvent({ countryAccountsId: deTenant });
		await dr.insert(eventCausalityTable).values({
			triggeringEntityType: "HE",
			triggeringHazardousEventId: he.id,
			triggeredEntityType: "DE",
			triggeredDisasterEventId: deId,
		});

		await HazardousEventRepository.delete(he.id);

		const linked =
			await EventCausalityRepository.getLinkedHazardousEventIds(deId);
		expect(linked.linkedTriggeringHazardousEventIds).toHaveLength(0); // silently gone, same pattern as 0a finding #8
	});
});
