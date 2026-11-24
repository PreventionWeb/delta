import "../setup";
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { sql, TransactionRollbackError } from "drizzle-orm";
import { dr } from "~/db.server";
import { auditLogsTable } from "~/drizzle/schema/auditLogsTable";
import { DrizzleAuditLogAdapter } from "~/domains/shared/audit-log/infrastructure/DrizzleAuditLogAdapter.server";
import {
	seedCountryAccount,
	seedUser,
} from "../models/hazardousEventTestHelpers";

async function insertAuditRow(row: {
	tableName: string;
	recordId: string;
	userId: string;
	action: string;
	countryAccountsId: string | null;
}): Promise<void> {
	await dr.insert(auditLogsTable).values({
		tableName: row.tableName,
		recordId: row.recordId,
		userId: row.userId,
		action: row.action,
		countryAccountsId: row.countryAccountsId,
	});
}

describe("DrizzleAuditLogAdapter.findByRecord", () => {
	it("returns rows for the given tenant newest-first, excluding a different tenant's row for the same table/record", async () => {
		const [tenantA, tenantB, userA] = await Promise.all([
			seedCountryAccount(),
			seedCountryAccount(),
			seedUser(),
		]);
		const recordId = randomUUID();
		const adapter = new DrizzleAuditLogAdapter(dr);

		await insertAuditRow({
			tableName: "hazardous_event",
			recordId,
			userId: userA,
			action: "Create hazardous event",
			countryAccountsId: tenantA,
		});
		// Force a later timestamp so newest-first ordering is actually exercised, not tied.
		await new Promise((resolve) => setTimeout(resolve, 5));
		await insertAuditRow({
			tableName: "hazardous_event",
			recordId,
			userId: userA,
			action: "Update hazardous event",
			countryAccountsId: tenantA,
		});
		await insertAuditRow({
			tableName: "hazardous_event",
			recordId,
			userId: userA,
			action: "Create hazardous event",
			countryAccountsId: tenantB,
		});

		const result = await adapter.findByRecord(
			"hazardous_event",
			recordId,
			tenantA,
		);

		expect(result).toHaveLength(2);
		expect(result.map((row) => row.action)).toEqual([
			"Update hazardous event",
			"Create hazardous event",
		]);
		expect(result.every((row) => row.id !== undefined)).toBe(true);
	});

	it("resolves an empty array when no rows match the table/record/tenant combination", async () => {
		const tenantA = await seedCountryAccount();
		const adapter = new DrizzleAuditLogAdapter(dr);

		await expect(
			adapter.findByRecord("hazardous_event", randomUUID(), tenantA),
		).resolves.toEqual([]);
	});

	it("resolves without throwing when the acting user's firstName is null", async () => {
		const [tenantA, userA] = await Promise.all([
			seedCountryAccount(),
			seedUser(),
		]);
		const recordId = randomUUID();
		const adapter = new DrizzleAuditLogAdapter(dr);

		await insertAuditRow({
			tableName: "hazardous_event",
			recordId,
			userId: userA,
			action: "Create hazardous event",
			countryAccountsId: tenantA,
		});

		const result = await adapter.findByRecord(
			"hazardous_event",
			recordId,
			tenantA,
		);

		expect(result).toHaveLength(1);
		// seedUser() sets no firstName -- actorName must fall back to "", not null.
		expect(result[0].actorName).toBe("");
	});

	it("resolves without throwing when the row's user_id no longer matches any userTable row", async () => {
		const tenantA = await seedCountryAccount();
		const recordId = randomUUID();

		// Real orphans can't exist (FK + CASCADE), so simulated via session_replication_role and
		// rolled back; PGlite surfaces tx.rollback() as an error here, so it's caught, not left to fail.
		await dr
			.transaction(async (tx) => {
				await tx.execute(sql`SET session_replication_role = replica`);
				await tx.execute(sql`
				INSERT INTO audit_logs (table_name, record_id, user_id, action, country_accounts_id)
				VALUES (${"hazardous_event"}, ${recordId}, ${randomUUID()}, ${"Create hazardous event"}, ${tenantA})
			`);
				await tx.execute(sql`SET session_replication_role = DEFAULT`);
				// findByRecord has no tx param; point a fresh adapter at tx itself to read
				// this transaction's uncommitted row before rollback.
				const result = await new DrizzleAuditLogAdapter(
					tx as unknown as typeof dr,
				).findByRecord("hazardous_event", recordId, tenantA);
				expect(result).toHaveLength(1);
				expect(result[0].actorName).toBe("");
				await tx.rollback();
			})
			.catch((err) => {
				if (!(err instanceof TransactionRollbackError)) {
					throw err;
				}
			});
	});
});
