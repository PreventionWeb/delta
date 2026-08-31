// Phase 0a characterization tests — see hazardous-events-phase0-audit-findings.md before "fixing" any failure here.
import "../setup";
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { dr } from "~/db.server";
import { eq } from "drizzle-orm";
import { eventTable } from "../testSchema/eventTable";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { disasterEventTable } from "../testSchema/disasterEventTable";
import { eventRelationshipTable } from "../testSchema/eventRelationshipTable";
import { eventCausalityTable } from "../testSchema/eventCausalityTable";
import { auditLogsTable } from "../testSchema/auditLogsTable";
import {
	validate,
	hazardousEventCreate,
	hazardousEventUpdate,
	hazardousEventUpdateByIdAndCountryAccountsId,
	hazardousEventDelete,
} from "~/backend.server/models/event";
import {
	ctx,
	seedCountryAccount,
	seedUser,
	baseFields,
	seedHazardousEvent,
} from "./hazardousEventTestHelpers";

describe("validate()", () => {
	it("does NOT error on HIP fields when none are set at all (only a partial hierarchy errors)", () => {
		const errors = validate(ctx, { recordOriginator: "x" });
		expect(errors.fields?.hipHazardId).toBeUndefined();
	});

	it("requires cluster when only hazard is set", () => {
		const errors = validate(ctx, { recordOriginator: "x", hipHazardId: "h1" });
		expect(errors.fields?.hipHazardId?.[0]).toBeDefined();
	});

	it("QUIRK: requires type when only cluster is set, but the error is still attached to the hipHazardId field key, not hipClusterId/hipTypeId", () => {
		const errors = validate(ctx, { recordOriginator: "x", hipClusterId: "c1" });
		expect(errors.fields?.hipHazardId?.[0]).toBeDefined();
	});

	it("requires both startDate and endDate when either is present in a partial update", () => {
		const errors = validate(ctx, {
			recordOriginator: "x",
			startDate: "2024-01-01",
		});
		expect(errors.fields?.endDate?.[0]).toBeDefined();
	});

	it("rejects startDate after endDate", () => {
		const errors = validate(ctx, {
			recordOriginator: "x",
			startDate: "2024-06-01",
			endDate: "2024-01-01",
		});
		expect(errors.fields?.startDate?.[0]).toBeDefined();
	});

	it("does not error on dates when neither startDate nor endDate key is present", () => {
		const errors = validate(ctx, { recordOriginator: "x" });
		expect(errors.fields?.startDate).toBeUndefined();
		expect(errors.fields?.endDate).toBeUndefined();
	});

	it("requires recordOriginator", () => {
		const errors = validate(ctx, {});
		expect(errors.fields?.recordOriginator?.[0]).toBeDefined();
	});
});

describe("hazardousEventCreate()", () => {
	it("creates the event and hazardous_event rows on the happy path", async () => {
		const fields = await baseFields();
		const result = await dr.transaction(async (tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const [row] = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, result.id));
		expect(row).toBeDefined();
		expect(row.recordOriginator).toBe("Field survey");
	});

	it("rejects creation when required fields are missing, with no rows persisted", async () => {
		const fields = await baseFields({ recordOriginator: undefined as any });
		const result = await dr.transaction(async (tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);

		expect(result.ok).toBe(false);

		const rows = await dr.select().from(eventTable);
		// Confirm nothing was inserted for this failed attempt (other tests' rows may exist).
		expect(
			rows.some(
				(r) => r.description === fields.description && r.name === fields.name,
			),
		).toBe(false);
	});

	it("rejects a parent that does not exist", async () => {
		const fields = await baseFields({ parent: randomUUID() });
		const result = await dr.transaction(async (tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(result.ok).toBe(false);
	});

	it("rejects a parent belonging to a different tenant", async () => {
		const otherTenantParent = await seedHazardousEvent();
		const fields = await baseFields({ parent: otherTenantParent.id });
		const result = await dr.transaction(async (tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(result.ok).toBe(false);
	});

	it("logs an audit entry when createdByUserId is a real user id", async () => {
		const userId = await seedUser();
		const fields = await baseFields({ createdByUserId: userId });
		const result = await dr.transaction(async (tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const logs = await dr
			.select()
			.from(auditLogsTable)
			.where(eq(auditLogsTable.recordId, result.id));
		expect(logs).toHaveLength(1);
		expect(logs[0].action).toBe("Create hazardous event");
	});

	it("links to a same-tenant parent via event_relationship on success", async () => {
		const countryAccountsId = await seedCountryAccount();
		const parent = await seedHazardousEvent({ countryAccountsId });
		const fields = await baseFields({ countryAccountsId, parent: parent.id });

		const result = await dr.transaction(async (tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const [rel] = await dr
			.select()
			.from(eventRelationshipTable)
			.where(eq(eventRelationshipTable.childId, result.id));
		expect(rel).toMatchObject({ parentId: parent.id, type: "caused_by" });
	});
});

describe("hazardousEventUpdate()", () => {
	it("rejects when the record does not exist in the caller's tenant", async () => {
		const countryAccountsId = await seedCountryAccount();
		const result = await hazardousEventUpdate(ctx, dr as any, randomUUID(), {
			countryAccountsId,
			recordOriginator: "x",
		});
		expect(result.ok).toBe(false);
	});

	it("blocks setting an event as its own parent", async () => {
		const record = await seedHazardousEvent();
		const result = await hazardousEventUpdate(ctx, dr as any, record.id, {
			countryAccountsId: record.countryAccountsId,
			parent: record.id,
		});
		expect(result.ok).toBe(false);
		expect(result.ok || (result.errors.fields?.parent?.[0] as any)?.code).toBe(
			"ErrSelfReference",
		);
	});

	it("rejects a parent that does not exist (live-only guard, absent from the orphaned split file)", async () => {
		const record = await seedHazardousEvent();
		const result = await hazardousEventUpdate(ctx, dr as any, record.id, {
			countryAccountsId: record.countryAccountsId,
			parent: randomUUID(),
		});
		expect(result.ok).toBe(false);
		expect(result.ok || (result.errors.fields?.parent?.[0] as any)?.code).toBe(
			"ErrParentNotFound",
		);
	});

	it("rejects a parent belonging to a different tenant (live-only guard, absent from the orphaned split file)", async () => {
		const record = await seedHazardousEvent();
		const otherTenantParent = await seedHazardousEvent();
		const result = await hazardousEventUpdate(ctx, dr as any, record.id, {
			countryAccountsId: record.countryAccountsId,
			parent: otherTenantParent.id,
		});
		expect(result.ok).toBe(false);
		expect(result.ok || (result.errors.fields?.parent?.[0] as any)?.code).toBe(
			"ErrCrossTenantReference",
		);
	});

	it("blocks a cyclic parent assignment", async () => {
		const countryAccountsId = await seedCountryAccount();
		const a = await seedHazardousEvent({ countryAccountsId });
		const b = await seedHazardousEvent({ countryAccountsId });
		// Seed b caused_by a directly.
		await dr
			.insert(eventRelationshipTable)
			.values({ parentId: a.id, childId: b.id, type: "caused_by" });

		// Now try to make a caused_by b — would close the loop.
		const result = await hazardousEventUpdate(ctx, dr as any, a.id, {
			countryAccountsId,
			parent: b.id,
		});
		expect(result.ok).toBe(false);
		expect(result.ok || (result.errors.fields?.parent?.[0] as any)?.code).toBe(
			"ErrRelationCycle",
		);
	});

	it("blocks a parent that starts after the child, when both dates are set", async () => {
		const countryAccountsId = await seedCountryAccount();
		const parent = await seedHazardousEvent({ countryAccountsId });
		const child = await seedHazardousEvent({ countryAccountsId });
		await dr
			.update(hazardousEventTable)
			.set({ startDate: "2024-06-01" })
			.where(eq(hazardousEventTable.id, parent.id));
		await dr
			.update(hazardousEventTable)
			.set({ startDate: "2024-01-01" })
			.where(eq(hazardousEventTable.id, child.id));

		const result = await hazardousEventUpdate(ctx, dr as any, child.id, {
			countryAccountsId,
			parent: parent.id,
		});
		expect(result.ok).toBe(false);
		expect(result.ok || (result.errors.fields?.parent?.[0] as any)?.code).toBe(
			"ErrTemporalCausality",
		);
	});

	it("QUIRK: does not block a temporally-inverted parent when only one side has a date set", async () => {
		const countryAccountsId = await seedCountryAccount();
		const parent = await seedHazardousEvent({ countryAccountsId });
		const child = await seedHazardousEvent({ countryAccountsId });
		// Only the child has a start date; parent's is unset.
		await dr
			.update(hazardousEventTable)
			.set({ startDate: "2020-01-01" })
			.where(eq(hazardousEventTable.id, child.id));

		const result = await hazardousEventUpdate(ctx, dr as any, child.id, {
			countryAccountsId,
			parent: parent.id,
		});
		expect(result.ok).toBe(true);
	});

	it("replaces the existing parent link, not accumulates it", async () => {
		const countryAccountsId = await seedCountryAccount();
		const oldParent = await seedHazardousEvent({ countryAccountsId });
		const newParent = await seedHazardousEvent({ countryAccountsId });
		const child = await seedHazardousEvent({ countryAccountsId });
		await dr
			.insert(eventRelationshipTable)
			.values({ parentId: oldParent.id, childId: child.id, type: "caused_by" });

		const result = await hazardousEventUpdate(ctx, dr as any, child.id, {
			countryAccountsId,
			parent: newParent.id,
		});
		expect(result.ok).toBe(true);

		const rels = await dr
			.select()
			.from(eventRelationshipTable)
			.where(eq(eventRelationshipTable.childId, child.id));
		expect(rels).toHaveLength(1);
		expect(rels[0].parentId).toBe(newParent.id);
	});

	it("clears the parent link when parent is set to null", async () => {
		const countryAccountsId = await seedCountryAccount();
		const parent = await seedHazardousEvent({ countryAccountsId });
		const child = await seedHazardousEvent({ countryAccountsId });
		await dr
			.insert(eventRelationshipTable)
			.values({ parentId: parent.id, childId: child.id, type: "caused_by" });

		const result = await hazardousEventUpdate(ctx, dr as any, child.id, {
			countryAccountsId,
			parent: null as any,
		});
		expect(result.ok).toBe(true);

		const rels = await dr
			.select()
			.from(eventRelationshipTable)
			.where(eq(eventRelationshipTable.childId, child.id));
		expect(rels).toHaveLength(0);
	});
});

describe("hazardousEventUpdateByIdAndCountryAccountsId()", () => {
	it("applies the same self-reference / cycle / temporal guards as hazardousEventUpdate", async () => {
		const record = await seedHazardousEvent();
		const result = await hazardousEventUpdateByIdAndCountryAccountsId(
			ctx,
			dr as any,
			record.id,
			record.countryAccountsId,
			{ parent: record.id },
		);
		expect(result.ok).toBe(false);
	});

	it("rejects when the record is not found for the given tenant", async () => {
		const result = await hazardousEventUpdateByIdAndCountryAccountsId(
			ctx,
			dr as any,
			randomUUID(),
			await seedCountryAccount(),
			{ recordOriginator: "x" },
		);
		expect(result.ok).toBe(false);
	});

	it("rejects a parent that does not exist", async () => {
		const record = await seedHazardousEvent();
		const result = await hazardousEventUpdateByIdAndCountryAccountsId(
			ctx,
			dr as any,
			record.id,
			record.countryAccountsId,
			{ parent: randomUUID() },
		);
		expect(result.ok).toBe(false);
	});

	it("rejects a parent belonging to a different tenant", async () => {
		const record = await seedHazardousEvent();
		const otherTenantParent = await seedHazardousEvent();
		const result = await hazardousEventUpdateByIdAndCountryAccountsId(
			ctx,
			dr as any,
			record.id,
			record.countryAccountsId,
			{ parent: otherTenantParent.id },
		);
		expect(result.ok).toBe(false);
	});
});

describe("hazardousEventDelete()", () => {
	it("deletes the event and hazardous_event rows on the happy path", async () => {
		const record = await seedHazardousEvent();
		const result = await hazardousEventDelete(
			ctx,
			record.id,
			record.countryAccountsId,
		);
		expect(result.ok).toBe(true);

		const rows = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, record.id));
		expect(rows).toHaveLength(0);
	});

	it("is blocked when a disaster event references it via the primary hazardousEventId FK", async () => {
		const record = await seedHazardousEvent();
		const [de] = await dr
			.insert(eventTable)
			.values({ name: "DE", description: "DE" })
			.returning({ id: eventTable.id });
		await dr.insert(disasterEventTable).values({
			id: de.id,
			countryAccountsId: record.countryAccountsId,
			hazardousEventId: record.id,
		});

		const result = await hazardousEventDelete(
			ctx,
			record.id,
			record.countryAccountsId,
		);
		expect(result.ok).toBe(false);

		const rows = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, record.id));
		expect(rows).toHaveLength(1);
	});

	it("QUIRK: is NOT blocked when only linked via event_causality — the row cascade-deletes silently", async () => {
		const record = await seedHazardousEvent();
		const [de] = await dr
			.insert(eventTable)
			.values({ name: "DE", description: "DE" })
			.returning({ id: eventTable.id });
		await dr.insert(disasterEventTable).values({
			id: de.id,
			countryAccountsId: record.countryAccountsId,
			// Deliberately NOT setting hazardousEventId — only the causality-table link exists.
		});
		await dr.insert(eventCausalityTable).values({
			triggeringEntityType: "HE",
			triggeringHazardousEventId: record.id,
			triggeredEntityType: "DE",
			triggeredDisasterEventId: de.id,
		});

		const result = await hazardousEventDelete(
			ctx,
			record.id,
			record.countryAccountsId,
		);
		// Dependent-check only reads hazardousEventId, not event_causality — see audit findings doc.
		expect(result.ok).toBe(true);

		const causalityRows = await dr
			.select()
			.from(eventCausalityTable)
			.where(eq(eventCausalityTable.triggeringHazardousEventId, record.id));
		expect(causalityRows).toHaveLength(0); // silently cascade-deleted, not preserved
	});

	it("BUG: the reactive FK-23503 catch never fires (error.code is nested under .cause) — see audit findings doc", async () => {
		const countryAccountsId = await seedCountryAccount();
		const parent = await seedHazardousEvent({ countryAccountsId });
		const child = await seedHazardousEvent({ countryAccountsId });
		await dr
			.insert(eventRelationshipTable)
			.values({ parentId: parent.id, childId: child.id, type: "caused_by" });

		await expect(
			hazardousEventDelete(ctx, parent.id, countryAccountsId),
		).rejects.toMatchObject({ cause: { code: "23503" } });

		const rows = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, parent.id));
		expect(rows).toHaveLength(1); // delete rolled back — data integrity is fine, only the UX message is broken
	});

	it("rejects deletion for a record outside the caller's tenant", async () => {
		const record = await seedHazardousEvent();
		const result = await hazardousEventDelete(
			ctx,
			record.id,
			await seedCountryAccount(),
		);
		expect(result.ok).toBe(false);
	});
});
