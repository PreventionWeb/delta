// Phase 0e characterization tests — see hazardous-events-phase0-audit-findings.md before "fixing" any failure here.
// Covers csvCreate/csvUpdate/csvUpsert (app/backend.server/handlers/form/form_csv.ts) wired for
// Hazardous Events via app/routes/$lang+/hazardous-event+/csv-import.tsx. Tested at the PGlite
// layer, not E2E: these functions take already-parsed CSV rows and a plain session-derived
// countryAccountsId string — no browser/session/multipart-upload machinery is actually exercised
// by the bug itself, so PGlite characterizes it precisely and far faster than a browser round-trip.
import "../setup";
import { describe, it, expect, vi } from "vitest";
import { dr } from "~/db.server";
import { eq } from "drizzle-orm";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";

vi.mock("~/components/ContentRepeater/UploadFile", () => ({
	ContentRepeaterUploadFile: {
		save: vi.fn((items: any[]) => items),
		delete: vi.fn((items: any[]) => items),
	},
}));

import {
	csvCreate,
	csvUpdate,
	csvUpsert,
} from "~/backend.server/handlers/form/form_csv";
import {
	hazardousEventCreate,
	hazardousEventUpdate,
	hazardousEventIdByImportId,
} from "~/backend.server/models/event";
import { fieldsDefApi } from "~/frontend/events/hazardeventform";
import {
	ctx,
	seedCountryAccount,
	seedHipChain,
	seedHazardousEvent,
} from "./hazardousEventTestHelpers";

function csvRow(hip: {
	hipTypeId: string;
	hipClusterId: string;
	hipHazardId: string;
}) {
	return {
		headers: [
			"startDate",
			"endDate",
			"recordOriginator",
			"apiImportId",
			"hipTypeId",
			"hipClusterId",
			"hipHazardId",
		],
		values: (apiImportId: string, recordOriginator: string) => [
			"2025-01-01",
			"2025-01-02",
			recordOriginator,
			apiImportId,
			hip.hipTypeId,
			hip.hipClusterId,
			hip.hipHazardId,
		],
	};
}

describe("csvCreate — tenant scoping", () => {
	it("BUG: the session-derived countryAccountsId argument is silently ignored — hazardousEventCreate only accepts 3 params, csvCreate always calls it with 4", async () => {
		const hip = await seedHipChain();
		const row = csvRow(hip);
		const fieldsDef = fieldsDefApi(ctx as any);

		const res: any = await csvCreate(
			{
				ctx: ctx as any,
				data: [row.headers, row.values("no-tenant-col", "orphan")],
				fieldsDef,
				create: hazardousEventCreate,
			},
			"this-session-tenant-is-never-consulted",
		);
		expect(res.ok).toBe(true);

		const [created] = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, res.res[1][0]));
		expect(created.countryAccountsId).toBeNull(); // an orphan record, invisible to any tenant-scoped list view
	});

	it("BUG: a CSV row can specify ANY tenant's countryAccountsId and the record is created under that tenant, regardless of the uploader's own session tenant", async () => {
		const hip = await seedHipChain();
		const uploadersRealTenant = await seedCountryAccount();
		const targetForeignTenant = await seedCountryAccount();
		const row = csvRow(hip);
		const fieldsDef = fieldsDefApi(ctx as any);

		const res: any = await csvCreate(
			{
				ctx: ctx as any,
				data: [
					[...row.headers, "countryAccountsId"],
					[
						...row.values("cross-tenant-inject", "injected"),
						targetForeignTenant,
					],
				],
				fieldsDef,
				create: hazardousEventCreate,
			},
			uploadersRealTenant,
		);
		expect(res.ok).toBe(true);

		const [created] = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, res.res[1][0]));
		expect(created.countryAccountsId).toBe(targetForeignTenant); // not uploadersRealTenant — real bug, see audit findings doc
	});
});

describe("csvUpdate — tenant scoping on an existing record's id", () => {
	it("BUG: the same signature mismatch lets a CSV 'update' row's countryAccountsId column override which tenant's guard is checked, not the uploader's session", async () => {
		const targetTenant = await seedCountryAccount();
		const target = await seedHazardousEvent({
			countryAccountsId: targetTenant,
		});
		const uploadersRealTenant = await seedCountryAccount();
		const fieldsDef = fieldsDefApi(ctx as any);

		const res: any = await csvUpdate(
			{
				ctx: ctx as any,
				data: [
					["id", "recordOriginator", "countryAccountsId"],
					[target.id, "hijacked via csv update", targetTenant],
				],
				fieldsDef,
				update: hazardousEventUpdate,
			},
			uploadersRealTenant, // the uploader's own tenant is never actually checked
		);
		expect(res.ok).toBe(true);

		const [row] = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, target.id));
		expect(row.recordOriginator).toBe("hijacked via csv update");
	});
});

describe("csvUpsert — apiImportId lookup ignores tenant entirely", () => {
	it("BUG: hazardousEventIdByImportId (wired as idByImportIdAndCountryAccountsId) has no tenant filter — anyone who knows a colliding apiImportId AND the target's countryAccountsId can overwrite another tenant's record instead of creating a new one", async () => {
		// NOTE: hazardousEventUpdate's own oldRecord lookup (event.ts ~line 812) DOES require
		// fields.countryAccountsId to match the target row's real tenant, so exploiting this via
		// csvUpsert needs BOTH a colliding apiImportId AND the victim's actual countryAccountsId
		// (a UUID, not necessarily secret) — not a blind zero-knowledge attack. The lookup itself
		// having no tenant filter is still the bug: it should never resolve to a foreign tenant's
		// row at all, regardless of what the caller does or doesn't know afterward.
		const victimTenant = await seedCountryAccount();
		const victim = await seedHazardousEvent({
			countryAccountsId: victimTenant,
			name: "Victim's original record",
		});
		await dr
			.update(hazardousEventTable)
			.set({ apiImportId: "SHARED-IMPORT-ID" })
			.where(eq(hazardousEventTable.id, victim.id));

		const hip = await seedHipChain();
		const attackerTenant = await seedCountryAccount();
		const fieldsDef = fieldsDefApi(ctx as any);

		const res: any = await csvUpsert(
			{
				ctx: ctx as any,
				data: [
					[
						"startDate",
						"endDate",
						"recordOriginator",
						"apiImportId",
						"hipTypeId",
						"hipClusterId",
						"hipHazardId",
						"countryAccountsId",
					],
					[
						"2025-01-01",
						"2025-01-02",
						"overwritten by attacker",
						"SHARED-IMPORT-ID",
						hip.hipTypeId,
						hip.hipClusterId,
						hip.hipHazardId,
						victimTenant, // attacker supplies the victim's real tenant id
					],
				],
				fieldsDef,
				create: hazardousEventCreate,
				update: hazardousEventUpdate,
				idByImportIdAndCountryAccountsId: hazardousEventIdByImportId,
			},
			attackerTenant,
		);
		expect(res.ok).toBe(true); // real bug, not a test bug — see audit findings doc

		const [row1] = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, victim.id));
		expect(row1.recordOriginator).toBe("overwritten by attacker");
		expect(row1.countryAccountsId).toBe(victimTenant); // still victim's own tenant, but its data is gone
	});

	it("confirms the isolated lookup function itself has no tenant parameter at all", async () => {
		const victimTenant = await seedCountryAccount();
		const victim = await seedHazardousEvent({
			countryAccountsId: victimTenant,
		});
		await dr
			.update(hazardousEventTable)
			.set({ apiImportId: "LOOKUP-ONLY-TEST" })
			.where(eq(hazardousEventTable.id, victim.id));

		const foundId = await hazardousEventIdByImportId(
			dr as any,
			"LOOKUP-ONLY-TEST",
		);
		expect(foundId).toBe(victim.id); // found regardless of any tenant context
	});
});
