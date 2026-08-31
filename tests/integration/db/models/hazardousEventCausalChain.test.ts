// Phase 0b characterization tests — see hazardous-events-phase0-audit-findings.md before "fixing" any failure here.
import "../setup";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { eq } from "drizzle-orm";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { eventRelationshipTable } from "../testSchema/eventRelationshipTable";
import {
	hazardousEventUpdate,
	hazardousEventCreate,
} from "~/backend.server/models/event";
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
		const chain = await seedChain(countryAccountsId, 4); // chain[0] <- chain[1] <- chain[2] <- chain[3]

		const result = await hazardousEventUpdate(ctx, dr as any, chain[0].id, {
			countryAccountsId,
			parent: chain[3].id,
		});
		expect(result.ok).toBe(false);
		expect(result.ok || (result.errors.fields?.parent?.[0] as any)?.code).toBe(
			"ErrRelationCycle",
		);
	});

	it("BUG: cycle detection is capped at recursion depth 10 — a cycle across a longer chain goes undetected and gets persisted", async () => {
		const countryAccountsId = await seedCountryAccount();
		const chainLength = 20;
		const chain = await seedChain(countryAccountsId, chainLength);

		const result = await hazardousEventUpdate(ctx, dr as any, chain[0].id, {
			countryAccountsId,
			parent: chain[chainLength - 1].id,
		});
		expect(result.ok).toBe(true); // real bug, not a test bug — see audit findings doc

		const rel = await dr
			.select()
			.from(eventRelationshipTable)
			.where(eq(eventRelationshipTable.childId, chain[0].id));
		expect(rel).toHaveLength(1);
		expect(rel[0].parentId).toBe(chain[chainLength - 1].id); // a real cycle now exists in the data
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

	it("QUIRK: a month-level parent date normalizes to the 1st, so it optimistically passes against an earlier child day in the same month", async () => {
		const countryAccountsId = await seedCountryAccount();
		const parent = await seedHazardousEvent({ countryAccountsId });
		const child = await seedHazardousEvent({ countryAccountsId });
		await setStartDate(parent.id, "2020-06"); // normalizes to 2020-06-01
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
	it("creation only checks parent existence + tenant, never cycle/temporal (a new event can't be an ancestor yet)", async () => {
		const countryAccountsId = await seedCountryAccount();
		const parent = await seedHazardousEvent({ countryAccountsId });
		const fields = await baseFields({ countryAccountsId, parent: parent.id });

		const result = await dr.transaction(async (tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(result.ok).toBe(true);
	});
});
