// Phase 0e characterization tests — see hazardous-events-phase0-audit-findings.md before "fixing" any failure here.
// jsonCreate/Update/Upsert as wired by api+/hazardous-event+/{add,update,upsert}.ts — PGlite, not
// E2E (the real-Postgres E2E tier proved unstable for this route family, see apiAuth finding).
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
	jsonCreate,
	jsonUpdate,
	jsonUpsert,
} from "~/backend.server/handlers/form/form_api";
import {
	hazardousEventCreate,
	hazardousEventUpdate,
	hazardousEventUpdateByIdAndCountryAccountsId,
	hazardousEventIdByImportIdAndCountryAccountsId,
} from "~/backend.server/models/event";
import { fieldsDefApi } from "~/frontend/events/hazardeventform";
import {
	ctx,
	seedCountryAccount,
	seedHipChain,
	seedHazardousEvent,
} from "./hazardousEventTestHelpers";

describe("jsonCreate — mirrors add.ts's forced countryAccountsId override", () => {
	it("a spoofed countryAccountsId in the payload is discarded before jsonCreate ever sees it, matching add.ts's own data.map override", async () => {
		const ownTenant = await seedCountryAccount();
		const foreignTenant = await seedCountryAccount();
		const hip = await seedHipChain();
		const fieldsDef = fieldsDefApi(ctx as any);

		// Exactly what add.ts does at line ~30 before calling jsonCreate.
		const data = [
			{
				startDate: "2025-01-01",
				endDate: "2025-01-02",
				recordOriginator: "json api add test",
				hipTypeId: hip.hipTypeId,
				countryAccountsId: foreignTenant, // attempted spoof
			},
		].map((item) => ({ ...item, countryAccountsId: ownTenant }));

		const res = await jsonCreate({
			ctx: ctx as any,
			data,
			fieldsDef,
			create: hazardousEventCreate,
			countryAccountsId: ownTenant,
		});
		expect(res.ok).toBe(true);

		const [row] = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, res.res[0].id!));
		expect(row.countryAccountsId).toBe(ownTenant); // not foreignTenant
	});
});

describe("jsonUpdate — mirrors update.ts's hazardousEventUpdateByIdAndCountryAccountsId", () => {
	it("cannot update a record outside the caller's own tenant, unlike CSV's plain hazardousEventUpdate", async () => {
		const ownTenant = await seedCountryAccount();
		const foreignTenant = await seedCountryAccount();
		const foreignRecord = await seedHazardousEvent({
			countryAccountsId: foreignTenant,
		});
		const fieldsDef = fieldsDefApi(ctx as any);

		const res = await jsonUpdate({
			ctx: ctx as any,
			data: [{ id: foreignRecord.id, recordOriginator: "should not apply" }],
			fieldsDef,
			update: hazardousEventUpdateByIdAndCountryAccountsId,
			countryAccountsId: ownTenant,
		});
		expect(res.ok).toBe(false);
		expect(res.res[0].errors).toBeDefined();

		const [row] = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, foreignRecord.id));
		expect(row.recordOriginator).not.toBe("should not apply");
	});
});

describe("jsonUpsert — mirrors upsert.ts's tenant-scoped apiImportId lookup", () => {
	it("BUG-8-STYLE CONTRAST: an apiImportId collision with a foreign tenant's record creates a new record instead of overwriting it, unlike CSV's csvUpsert", async () => {
		const ownTenant = await seedCountryAccount();
		const foreignTenant = await seedCountryAccount();
		const hip = await seedHipChain();
		const foreignRecord = await seedHazardousEvent({
			countryAccountsId: foreignTenant,
			recordOriginator: "Foreign record via json api upsert test",
		});
		await dr
			.update(hazardousEventTable)
			.set({ apiImportId: "shared-json-api-import-id" })
			.where(eq(hazardousEventTable.id, foreignRecord.id));

		const fieldsDef = [
			...fieldsDefApi(ctx as any),
			{ key: "countryAccountsId" as const, label: "", type: "text" as const },
		];

		const res = await jsonUpsert({
			ctx: ctx as any,
			data: [
				{
					apiImportId: "shared-json-api-import-id",
					startDate: "2025-01-01",
					endDate: "2025-01-02",
					recordOriginator: "should create new, not overwrite foreign",
					hipTypeId: hip.hipTypeId,
					countryAccountsId: ownTenant,
				},
			],
			fieldsDef: fieldsDef as any,
			create: hazardousEventCreate,
			update: hazardousEventUpdate,
			idByImportIdAndCountryAccountsId:
				hazardousEventIdByImportIdAndCountryAccountsId,
			countryAccountsId: ownTenant,
		});
		expect(res.ok).toBe(true);
		const newId = (res.res[0] as any).id;
		expect(newId).not.toBe(foreignRecord.id);

		const [foreignRow] = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, foreignRecord.id));
		expect(foreignRow.recordOriginator).toBe(
			"Foreign record via json api upsert test",
		); // untouched
	});
});
