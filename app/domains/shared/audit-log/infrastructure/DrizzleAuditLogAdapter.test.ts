// PGlite-backed, real DB -- the "node" vitest project's own setupFiles already mocks
// ~/db.server globally (tests/integration/db/setup.ts), same as every other Drizzle adapter test
// in this codebase; this import just makes that dependency explicit at the top of the file.
import "../../../../../tests/integration/db/setup";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dr } from "~/db.server";
import { auditLogsTable } from "~/drizzle/schema/auditLogsTable";
import type { AuditLogEntry } from "~/domains/shared/audit-log/application/ports/IAuditLogPort";
import {
	seedCountryAccount,
	seedUser,
} from "../../../../../tests/integration/db/models/hazardousEventTestHelpers";
import { DrizzleAuditLogAdapter } from "./DrizzleAuditLogAdapter.server";

function makeEntry(
	overrides: Partial<AuditLogEntry> & { userId: string },
): AuditLogEntry {
	return {
		tableName: "hazardous_event",
		recordId: randomUUID(),
		action: "Create hazardous event",
		oldValues: null,
		newValues: { description: "a value" },
		countryAccountsId: null,
		...overrides,
	};
}

async function rowsFor(recordId: string) {
	return dr
		.select()
		.from(auditLogsTable)
		.where(eq(auditLogsTable.recordId, recordId));
}

describe("DrizzleAuditLogAdapter", () => {
	it("writes a full entry exactly as given, round-tripping oldValues/newValues", async () => {
		const userId = await seedUser();
		const countryAccountsId = (await seedCountryAccount()) as string;
		const adapter = new DrizzleAuditLogAdapter(dr);
		const entry = makeEntry({
			userId,
			countryAccountsId,
			oldValues: { status: "DRAFT" },
			newValues: { status: "SUBMITTED" },
		});

		await adapter.record(entry);

		const rows = await rowsFor(entry.recordId);
		expect(rows).toHaveLength(1);
		const [row] = rows;
		expect(row.tableName).toBe(entry.tableName);
		expect(row.recordId).toBe(entry.recordId);
		expect(row.userId).toBe(userId);
		expect(row.action).toBe(entry.action);
		expect(row.oldValues).toEqual({ status: "DRAFT" });
		expect(row.newValues).toEqual({ status: "SUBMITTED" });
		expect(row.countryAccountsId).toBe(countryAccountsId);
	});

	it("persists oldValues, newValues, and countryAccountsId as null when each is independently null", async () => {
		const userId = await seedUser();
		const adapter = new DrizzleAuditLogAdapter(dr);
		const entry = makeEntry({
			userId,
			oldValues: null,
			newValues: null,
			countryAccountsId: null,
		});

		await adapter.record(entry);

		const [row] = await rowsFor(entry.recordId);
		expect(row.oldValues).toBeNull();
		expect(row.newValues).toBeNull();
		expect(row.countryAccountsId).toBeNull();
	});

	it("writes immediately via its own client when no tx is given", async () => {
		const userId = await seedUser();
		const adapter = new DrizzleAuditLogAdapter(dr);
		const entry = makeEntry({ userId });

		await adapter.record(entry);

		// No surrounding transaction exists for this call at all -- the row being visible right
		// after record() resolves is the only thing "writes immediately" can mean here.
		expect(await rowsFor(entry.recordId)).toHaveLength(1);
	});

	it("rolls back with the caller's transaction when a later step in the same transaction throws", async () => {
		const userId = await seedUser();
		const adapter = new DrizzleAuditLogAdapter(dr);
		const entry = makeEntry({ userId });

		await expect(
			dr.transaction(async (tx) => {
				await adapter.record(entry, tx);
				throw new Error("boom-after-record");
			}),
		).rejects.toThrow("boom-after-record");

		expect(await rowsFor(entry.recordId)).toHaveLength(0);
	});

	it("persists once the caller's transaction commits", async () => {
		const userId = await seedUser();
		const adapter = new DrizzleAuditLogAdapter(dr);
		const entry = makeEntry({ userId });

		await dr.transaction(async (tx) => {
			await adapter.record(entry, tx);
		});

		expect(await rowsFor(entry.recordId)).toHaveLength(1);
	});

	it("two concurrent record() calls for two different entries each persist independently", async () => {
		const userId = await seedUser();
		const adapter = new DrizzleAuditLogAdapter(dr);
		const entryA = makeEntry({ userId, newValues: { marker: "A" } });
		const entryB = makeEntry({ userId, newValues: { marker: "B" } });

		await Promise.all([adapter.record(entryA), adapter.record(entryB)]);

		const [rowsA, rowsB] = await Promise.all([
			rowsFor(entryA.recordId),
			rowsFor(entryB.recordId),
		]);
		expect(rowsA).toHaveLength(1);
		expect(rowsB).toHaveLength(1);
		expect(rowsA[0].newValues).toEqual({ marker: "A" });
		expect(rowsB[0].newValues).toEqual({ marker: "B" });
	});
});
