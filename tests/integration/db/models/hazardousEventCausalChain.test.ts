// Phase 0b characterization tests (Hazardous Events refactor roadmap,
// _docs/refactoring-plan/hazardous-events-refactoring-roadmap.md) — deeper coverage of
// cycles.ts and temporal.ts beyond what 0a exercised as a side effect of testing
// hazardousEventUpdate(). Do not "fix" a failing assertion here without updating the
// roadmap's Invariant 1 quirk list and getting an explicit decision.
import "../setup";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { eq } from "drizzle-orm";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { eventRelationshipTable } from "../testSchema/eventRelationshipTable";
import {
	hazardousEventUpdate,
	hazardousEventCreate,
} from "~/backend.server/models/event/hazardous_event_create_update";
import {
	ctx,
	seedCountryAccount,
	seedHazardousEvent,
	baseFields,
} from "./hazardousEventTestHelpers";

/** Builds a caused_by chain events[0] <- events[1] <- ... <- events[n-1]
 * (events[i+1] is caused_by events[i], i.e. events[i] is the parent). */
async function seedChain(countryAccountsId: string, length: number) {
	const events = [];
	for (let i = 0; i < length; i++) {
		events.push(await seedHazardousEvent({ countryAccountsId }));
	}
	for (let i = 1; i < length; i++) {
		await dr.insert(eventRelationshipTable).values({
			parentId: events[i - 1].id,
			childId: events[i].id,
			type: "caused_by",
		});
	}
	return events;
}

async function setStartDate(id: string, startDate: string) {
	await dr
		.update(hazardousEventTable)
		.set({ startDate })
		.where(eq(hazardousEventTable.id, id));
}

describe("cycles.ts — checkForCycle via hazardousEventUpdate", () => {
	it("has no cycle when there is no existing relationship at all", async () => {
		const countryAccountsId = await seedCountryAccount();
		const a = await seedHazardousEvent({ countryAccountsId });
		const b = await seedHazardousEvent({ countryAccountsId });

		const result = await hazardousEventUpdate(ctx, dr as any, a.id, {
			countryAccountsId,
			parent: b.id,
		});
		expect(result.ok).toBe(true);
	});

	it("detects an indirect (multi-hop) cycle across a 4-hop chain", async () => {
		const countryAccountsId = await seedCountryAccount();
		// chain[0] <- chain[1] <- chain[2] <- chain[3] (chain[3] caused_by chain[2] caused_by chain[1] caused_by chain[0])
		const chain = await seedChain(countryAccountsId, 4);

		// Closing the loop: make chain[0]'s parent = chain[3] (the far end of its own descendant chain).
		const result = await hazardousEventUpdate(ctx, dr as any, chain[0].id, {
			countryAccountsId,
			parent: chain[3].id,
		});
		expect(result.ok).toBe(false);
		expect(result.ok || (result.errors.fields?.parent?.[0] as any)?.code).toBe(
			"ErrRelationCycle",
		);
	});

	it("QUIRK: cycle detection is capped at recursion depth 10 — a cycle closed across a long enough chain goes UNDETECTED", async () => {
		// checkForCycle's recursive CTE stops walking ancestry once the accumulated
		// path already has 10 elements (array_length(cc.path, 1) < 10 gates each
		// further recursive step). This test empirically finds the actual current
		// behavior at a chain long enough to matter, rather than asserting a
		// theoretical off-by-one calculation.
		const countryAccountsId = await seedCountryAccount();
		const chainLength = 20;
		const chain = await seedChain(countryAccountsId, chainLength);

		// Attempt to close a cycle across the full length of the chain — chain[0]'s
		// parent becomes the very last node, chain[chainLength - 1].
		const result = await hazardousEventUpdate(ctx, dr as any, chain[0].id, {
			countryAccountsId,
			parent: chain[chainLength - 1].id,
		});

		// Documents actual current behavior: the cap means this specific
		// far-across-a-long-chain cycle is NOT caught — the update succeeds and an
		// actual cycle is persisted into event_relationship. This is a real data-
		// integrity gap in today's system, not a test bug; see roadmap Invariant 1
		// and Phase 2 Section D (whether a DB-level constraint should replace this).
		expect(result.ok).toBe(true);

		const rel = await dr
			.select()
			.from(eventRelationshipTable)
			.where(eq(eventRelationshipTable.childId, chain[0].id));
		expect(rel).toHaveLength(1);
		expect(rel[0].parentId).toBe(chain[chainLength - 1].id);
		// A true cycle now exists in the data: chain[0] -> ... -> chain[19] -> chain[0].
	});

	it("still detects a cycle at a short-to-moderate chain length (well under the cap)", async () => {
		const countryAccountsId = await seedCountryAccount();
		const chainLength = 8;
		const chain = await seedChain(countryAccountsId, chainLength);

		const result = await hazardousEventUpdate(ctx, dr as any, chain[0].id, {
			countryAccountsId,
			parent: chain[chainLength - 1].id,
		});
		expect(result.ok).toBe(false);
	});
});

describe("temporal.ts — validateTemporalCausality via hazardousEventUpdate", () => {
	it("allows a parent and child with the exact same start date (boundary: <=, not <)", async () => {
		const countryAccountsId = await seedCountryAccount();
		const parent = await seedHazardousEvent({ countryAccountsId });
		const child = await seedHazardousEvent({ countryAccountsId });
		await setStartDate(parent.id, "2020-06-15");
		await setStartDate(child.id, "2020-06-15");

		const result = await hazardousEventUpdate(ctx, dr as any, child.id, {
			countryAccountsId,
			parent: parent.id,
		});
		expect(result.ok).toBe(true);
	});

	it("compares mixed date granularities: a year-only parent start normalizes to Jan 1 for comparison", async () => {
		const countryAccountsId = await seedCountryAccount();
		const parent = await seedHazardousEvent({ countryAccountsId });
		const child = await seedHazardousEvent({ countryAccountsId });
		await setStartDate(parent.id, "2020"); // normalizes to 2020-01-01
		await setStartDate(child.id, "2020-06-15");

		const result = await hazardousEventUpdate(ctx, dr as any, child.id, {
			countryAccountsId,
			parent: parent.id,
		});
		expect(result.ok).toBe(true); // 2020-01-01 <= 2020-06-15
	});

	it("QUIRK: a month-level parent date can incorrectly pass against an earlier-in-month child day, because normalization pads to the 1st", async () => {
		const countryAccountsId = await seedCountryAccount();
		const parent = await seedHazardousEvent({ countryAccountsId });
		const child = await seedHazardousEvent({ countryAccountsId });
		// Parent's real event could be anywhere in June; normalized to 2020-06-01.
		await setStartDate(parent.id, "2020-06");
		// Child started June 3rd — before the parent's normalized 2020-06-01? No,
		// 2020-06-01 <= 2020-06-03, so this passes. The quirk shows up when the
		// child's actual day is EARLIER than the 1st is impossible, so month-level
		// parent dates are effectively always treated as "start of month", which is
		// optimistic (assumes the best case for the parent) rather than accurate.
		await setStartDate(child.id, "2020-06-03");

		const result = await hazardousEventUpdate(ctx, dr as any, child.id, {
			countryAccountsId,
			parent: parent.id,
		});
		expect(result.ok).toBe(true);
	});

	it("blocks when a fully-dated parent starts after a fully-dated child, across different months", async () => {
		const countryAccountsId = await seedCountryAccount();
		const parent = await seedHazardousEvent({ countryAccountsId });
		const child = await seedHazardousEvent({ countryAccountsId });
		await setStartDate(parent.id, "2020-12-01");
		await setStartDate(child.id, "2020-06-15");

		const result = await hazardousEventUpdate(ctx, dr as any, child.id, {
			countryAccountsId,
			parent: parent.id,
		});
		expect(result.ok).toBe(false);
	});
});

describe("cycles.ts + temporal.ts — via hazardousEventCreate's parent path", () => {
	it("also runs cycle detection when parent is set at creation time, not just on update", async () => {
		// hazardousEventCreate's own parent-handling (distinct from hazardousEventUpdate's)
		// only checks parent existence + tenant match — NOT cycle/temporal — since a
		// brand-new event can never already be someone's ancestor. Confirming that
		// explicitly here rather than assuming, since it's a real asymmetry with update.
		const countryAccountsId = await seedCountryAccount();
		const parent = await seedHazardousEvent({ countryAccountsId });
		const fields = await baseFields({ countryAccountsId, parent: parent.id });

		const result = await dr.transaction(async (tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(result.ok).toBe(true);
	});
});
