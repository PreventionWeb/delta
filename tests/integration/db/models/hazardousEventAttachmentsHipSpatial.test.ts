// Phase 0d characterization tests — see hazardous-events-phase0-audit-findings.md before "fixing" any failure here.
import "../setup";
import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "crypto";
import { dr } from "~/db.server";
import { eq } from "drizzle-orm";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { divisionTable } from "../testSchema/divisionTable";
import { countryAccounts } from "../testSchema/countryAccounts";
import { countriesTable } from "../testSchema/countriesTable";

const { saveMock, deleteMock } = vi.hoisted(() => ({
	saveMock: vi.fn((items: any[]) => items),
	deleteMock: vi.fn((items: any[]) => items),
}));
vi.mock("~/components/ContentRepeater/UploadFile", () => ({
	ContentRepeaterUploadFile: { save: saveMock, delete: deleteMock },
}));

import {
	hazardousEventCreate,
	hazardousEventUpdate,
	hazardousEventById,
} from "~/backend.server/models/event";
import {
	dataForHazardPicker,
	getRequiredAndSetToNullHipFields,
} from "~/backend.server/models/hip_hazard_picker";
import {
	ctx,
	seedCountryAccount,
	seedHipChain,
	baseFields,
} from "./hazardousEventTestHelpers";

async function seedDivision(countryAccountsId: string, overrides: any = {}) {
	const [division] = await dr
		.insert(divisionTable)
		.values({
			countryAccountsId,
			name: { en: `Division ${randomUUID()}` },
			geojson: {
				type: "Polygon",
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0],
					],
				],
			},
			...overrides,
		})
		.returning();
	return division;
}

describe("hip_hazard_picker.ts — dataForHazardPicker()", () => {
	it("returns localized type/cluster/hazard names for the requested language", async () => {
		const suffix = randomUUID();
		const hip = await seedHipChain();

		const data = await dataForHazardPicker({ ...ctx, lang: "en" } as any);

		expect(data.types.some((t) => t.id === hip.hipTypeId)).toBe(true);
		expect(data.clusters.some((c) => c.id === hip.hipClusterId)).toBe(true);
		expect(data.hazards.some((h) => h.id === hip.hipHazardId)).toBe(true);
		void suffix;
	});

	it("QUIRK: falls back to English when the requested language key is missing from the jsonb name map", async () => {
		const hip = await seedHipChain();
		const data = await dataForHazardPicker({ ...ctx, lang: "fr" } as any);
		const type = data.types.find((t) => t.id === hip.hipTypeId);
		expect(type?.name).toBe("Test Type"); // seeded with { en: "Test Type" } only
	});
});

describe("hip_hazard_picker.ts — getRequiredAndSetToNullHipFields()", () => {
	it("QUIRK: mutates the passed fields object in place, setting unset HIP keys to null once any one of them is set", () => {
		const fields: any = { hipHazardId: "h1" };
		const result = getRequiredAndSetToNullHipFields(fields);
		expect(result).toBe("cluster");
		expect(fields.hipClusterId).toBeNull();
		expect(fields.hipTypeId).toBeNull();
	});

	it("does not touch the fields object at all when no HIP key is set", () => {
		const fields: any = { recordOriginator: "x" };
		getRequiredAndSetToNullHipFields(fields);
		expect(fields.hipClusterId).toBeUndefined();
		expect(fields.hipTypeId).toBeUndefined();
	});
});

describe("hazardous_event_geom / hazardous_event_division — spatial footprint round-trip via create/update/ById", () => {
	it("round-trips a 'Map coordinates' item through ST_GeomFromGeoJSON -> storage -> ST_AsGeoJSON", async () => {
		const countryAccountsId = await seedCountryAccount();
		const fields = await baseFields({
			countryAccountsId,
			spatialFootprint: [
				{
					map_option: "Map coordinates",
					title: "Point A",
					geojson: { type: "Point", coordinates: [10, 20] },
				},
			],
		} as any);

		const result = await dr.transaction((tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const got = await hazardousEventById(ctx, result.id, countryAccountsId);
		const mapItem = (got as any).spatialFootprint.find(
			(i: any) => i.map_option === "Map coordinates",
		);
		expect(mapItem.geojson.geometry).toEqual({
			type: "Point",
			coordinates: [10, 20],
		});
	});

	it("QUIRK: a 'Geographic level' item is never snapshotted — it's re-resolved live from division_table on every read", async () => {
		const countryAccountsId = await seedCountryAccount();
		const division = await seedDivision(countryAccountsId, {
			name: { en: "Original Name" },
		});
		const fields = await baseFields({
			countryAccountsId,
			spatialFootprint: [
				{
					map_option: "Geographic level",
					geojson: { properties: { division_id: division.id } },
				},
			],
		} as any);

		const result = await dr.transaction((tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		await dr
			.update(divisionTable)
			.set({ name: { en: "Renamed Later" } })
			.where(eq(divisionTable.id, division.id));

		const got = await hazardousEventById(ctx, result.id, countryAccountsId);
		const geoItem = (got as any).spatialFootprint.find(
			(i: any) => i.map_option === "Geographic level",
		);
		expect(geoItem.title).toBe("Renamed Later"); // reflects the rename, not what was saved at link time
	});

	it("QUIRK: the geographic-level display title always prefers the English name, ignoring the caller's language", async () => {
		const countryAccountsId = await seedCountryAccount();
		const division = await seedDivision(countryAccountsId, {
			name: { en: "English Name", fr: "Nom Francais" },
		});
		const fields = await baseFields({
			countryAccountsId,
			spatialFootprint: [
				{
					map_option: "Geographic level",
					geojson: { properties: { division_id: division.id } },
				},
			],
		} as any);

		const result = await dr.transaction((tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const got = await hazardousEventById(
			{ ...ctx, lang: "fr" } as any,
			result.id,
			countryAccountsId,
		);
		const geoItem = (got as any).spatialFootprint.find(
			(i: any) => i.map_option === "Geographic level",
		);
		expect(geoItem.title).toBe("English Name"); // not "Nom Francais", despite ctx.lang = "fr"
	});

	it("BUG: linking a 'Geographic level' item validates the division exists, but never checks it belongs to the event's own tenant", async () => {
		const [country] = await dr
			.insert(countriesTable)
			.values({ name: `Country ${randomUUID()}` })
			.returning();
		const [otherTenant] = await dr
			.insert(countryAccounts)
			.values({ shortDescription: "Other tenant", countryId: country.id })
			.returning();
		const foreignDivision = await seedDivision(otherTenant.id);

		const countryAccountsId = await seedCountryAccount();
		const fields = await baseFields({
			countryAccountsId,
			spatialFootprint: [
				{
					map_option: "Geographic level",
					geojson: { properties: { division_id: foreignDivision.id } },
				},
			],
		} as any);

		const result = await dr.transaction((tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(result.ok).toBe(true); // real bug, not a test bug — see audit findings doc
		if (!result.ok) return;

		const got = await hazardousEventById(ctx, result.id, countryAccountsId);
		const geoItem = (got as any).spatialFootprint.find(
			(i: any) => i.map_option === "Geographic level",
		);
		expect(geoItem).toBeDefined(); // a different tenant's division is now linked
	});

	it("re-syncing on update replaces the prior footprint wholesale, not merges it", async () => {
		const countryAccountsId = await seedCountryAccount();
		const fields = await baseFields({
			countryAccountsId,
			spatialFootprint: [
				{
					map_option: "Map coordinates",
					title: "First",
					geojson: { type: "Point", coordinates: [1, 1] },
				},
			],
		} as any);
		const created = await dr.transaction((tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		await dr.transaction((tx) =>
			hazardousEventUpdate(ctx, tx, created.id, {
				countryAccountsId,
				spatialFootprint: [
					{
						map_option: "Map coordinates",
						title: "Second",
						geojson: { type: "Point", coordinates: [2, 2] },
					},
				],
			} as any),
		);

		const got = await hazardousEventById(ctx, created.id, countryAccountsId);
		expect((got as any).spatialFootprint).toHaveLength(1);
		expect((got as any).spatialFootprint[0].title).toBe("Second");
	});
});

describe("processAndSaveAttachments (via hazardousEventCreate/Update) — DB-column write behavior", () => {
	it("QUIRK: create() always processes attachments, defaulting to an empty array, even when the caller supplies none at all", async () => {
		saveMock.mockClear();
		const countryAccountsId = await seedCountryAccount();
		const fields = await baseFields({ countryAccountsId });
		delete (fields as any).attachments;

		const result = await dr.transaction((tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(saveMock).toHaveBeenCalledTimes(1);
		expect(saveMock).toHaveBeenCalledWith(
			[],
			expect.any(String),
			expect.any(String),
		);

		const [row] = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, result.id));
		expect(row.attachments).toEqual([]);
	});

	it("persists whatever ContentRepeaterUploadFile.save returns into the attachments column", async () => {
		saveMock.mockClear();
		saveMock.mockReturnValueOnce([
			{ file: { name: "/uploads/hazardous-event/x/report.pdf" } },
		]);
		const countryAccountsId = await seedCountryAccount();
		const fields = await baseFields({
			countryAccountsId,
			attachments: [{ file: { name: "report.pdf" } }],
		} as any);

		const result = await dr.transaction((tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const [row] = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, result.id));
		expect(row.attachments).toEqual([
			{ file: { name: "/uploads/hazardous-event/x/report.pdf" } },
		]);
	});

	it("update() never calls ContentRepeaterUploadFile.save when attachments is omitted from the payload, leaving existing attachments untouched", async () => {
		const countryAccountsId = await seedCountryAccount();
		const fields = await baseFields({
			countryAccountsId,
			attachments: [{ file: { name: "existing.pdf" } }],
		} as any);
		saveMock.mockReturnValueOnce([
			{ file: { name: "/uploads/hazardous-event/x/existing.pdf" } },
		]);
		const created = await dr.transaction((tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		saveMock.mockClear();
		await dr.transaction((tx) =>
			hazardousEventUpdate(ctx, tx, created.id, {
				countryAccountsId,
				recordOriginator: "Updated originator, no attachments key",
			} as any),
		);

		expect(saveMock).not.toHaveBeenCalled();
		const [row] = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, created.id));
		expect(row.attachments).toEqual([
			{ file: { name: "/uploads/hazardous-event/x/existing.pdf" } },
		]);
	});

	it("directs uploads to the 'hazardous-event' subdirectory, distinct from other entity types sharing the same component", async () => {
		saveMock.mockClear();
		const countryAccountsId = await seedCountryAccount();
		const fields = await baseFields({ countryAccountsId });

		const result = await dr.transaction((tx) =>
			hazardousEventCreate(ctx, tx, fields),
		);
		expect(result.ok).toBe(true);

		expect(saveMock).toHaveBeenCalledWith(
			[],
			expect.any(String),
			expect.stringContaining("hazardous-event"),
		);
	});
});
