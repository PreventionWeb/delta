import "../../db/setup";
import { eq, sql } from "drizzle-orm";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { dr } from "~/db.server";
import {
	seedCountryAccount,
	seedHipChain,
} from "../../db/models/hazardousEventTestHelpers";
import {
	buildCsvHarness,
	exportAndReparse,
	runImport,
	seedCaEvent,
	seedCaEventWithFile,
	seedCausalLink,
	seedDivision,
	seedLegacyEvent,
	seedLegacyFootprint,
	seedLegacyHipWithTaxonomy,
	seedObservation,
	seedLegacyParentLink,
	seedUser,
	tenantSnapshot,
	type CsvHarness,
} from "./hazardousEventCsvTestHarness";

vi.setConfig({ testTimeout: 30_000 });

let harness: CsvHarness;

beforeAll(async () => {
	await dr.execute(sql`select 1`);
}, 60_000);

beforeEach(() => {
	harness = buildCsvHarness();
});

afterEach(() => {
	harness.cleanup();
});

/** Tenant with every shape the round trip must survive; every row has an apiImportId. */
async function seedRoundTripTenant() {
	const tenantId = await seedCountryAccount();
	// Phase M gives every legacy hip_hazard a specific_hazard with that source_ref_id.
	const hip = await seedLegacyHipWithTaxonomy();
	const specificHazardId = hip.specificHazardId;

	await seedCaEvent(harness, {
		tenantId,
		specificHazardId,
		workflow: "PUBLISHED",
		overrides: { apiImportId: "RT-PUBLISHED" },
	});
	const legacyParent = await seedCaEvent(harness, {
		tenantId,
		specificHazardId,
		overrides: { apiImportId: "RT-LEGACY-PARENT", startDate: "2024-12-01" },
	});
	const unmigrated = await seedLegacyEvent({
		tenantId,
		hip,
		approvalStatus: "validated",
		apiImportId: "RT-UNMIGRATED",
	});
	await seedLegacyParentLink(legacyParent, unmigrated);
	const legacyOnlyChild = await seedCaEvent(harness, {
		tenantId,
		specificHazardId,
		overrides: { apiImportId: "RT-LEGACY-CHILD" },
	});
	await seedLegacyParentLink(legacyParent, legacyOnlyChild);
	const cause = await seedCaEvent(harness, {
		tenantId,
		specificHazardId,
		overrides: { apiImportId: "RT-CAUSE", startDate: "2024-12-01" },
	});
	const effect = await seedCaEvent(harness, {
		tenantId,
		specificHazardId,
		overrides: { apiImportId: "RT-EFFECT" },
	});
	await seedCausalLink(cause, effect);
	await seedCaEvent(harness, {
		tenantId,
		specificHazardId,
		overrides: { apiImportId: "RT-MAGNITUDE", magnitude: "-5" },
	});
	// 6d-2 footprints: a CA observation, a migrated row on legacy rows only, an unmigrated
	// row with another tenant's legacy division (DEF-005), and a cleared observation.
	const division = await seedDivision(tenantId);
	const foreignDivision = await seedDivision(await seedCountryAccount());
	const footprinted = await seedCaEvent(harness, {
		tenantId,
		specificHazardId,
		overrides: { apiImportId: "RT-FOOTPRINT" },
	});
	await seedObservation(harness, {
		tenantId,
		eventId: footprinted,
		geometries: [
			{ type: "Point", coordinates: [77.123456789012345, 28.6] },
			{
				type: "Polygon",
				coordinates: [
					[
						[77, 28],
						[78, 28],
						[78, 29],
						[77, 28],
					],
				],
			},
		],
		divisionIds: [division],
	});
	await seedLegacyFootprint(legacyOnlyChild, [
		{ type: "Point", coordinates: [1.0000000006, 2] },
	]);
	await seedLegacyFootprint(
		unmigrated,
		[
			{
				type: "LineString",
				coordinates: [
					[0, 0],
					[1, 1],
				],
			},
		],
		[foreignDivision],
	);
	await seedObservation(harness, { tenantId, eventId: effect, geometries: [] });
	// 6d-2 attachments: a CA file and link, a form-stored ftp link, and legacy jsonb on the
	// unmigrated row (a tenantPath item and one with no file_option, A7).
	await seedCaEventWithFile(harness, {
		tenantId,
		specificHazardId,
		links: [
			{ title: "Report", url: "https://example.com/a" },
			{ title: "Old", url: "ftp://example.com/f" },
		],
	}).then(({ id }) =>
		dr
			.update(hazardousEventTable)
			.set({ apiImportId: "RT-ATTACHMENTS" })
			.where(eq(hazardousEventTable.id, id)),
	);
	await dr
		.update(hazardousEventTable)
		.set({
			attachments: [
				{
					id: "l1",
					title: "Legacy link",
					tag: [],
					file_option: "Link",
					url: "https://legacy.example/a",
					view: 1,
				},
				{
					id: "l2",
					title: "Legacy file",
					file_option: "File",
					file: {
						name: "/uploads/tenant-x/hazardous-event/e/l.pdf",
						tenantPath: "uploads/tenant-x",
						content_type: "application/pdf",
					},
				},
				{ id: "l3", title: "No option", url: "https://legacy.example/b" },
			],
		})
		.where(eq(hazardousEventTable.id, unmigrated));
	return { tenantId, rowCount: 9 };
}

describe("an exported file re-imports with no change", () => {
	it("a non-admin re-imports the export in update mode: every row unchanged and no table changes", async () => {
		const { tenantId, rowCount } = await seedRoundTripTenant();
		const userId = await seedUser();
		const file = await exportAndReparse(harness, tenantId);
		expect(file.rows).toHaveLength(rowCount);
		const before = await tenantSnapshot(tenantId);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "data-collector",
			mode: "update",
			header: file.header,
			rows: file.rows,
		});

		expect(result).toEqual({
			ok: true,
			mode: "update",
			created: 0,
			updated: 0,
			unchanged: rowCount,
			ignoredColumns: expect.any(Array),
		});
		expect(await tenantSnapshot(tenantId)).toEqual(before);
		// No file deleted or promoted; an observation would also have moved updated_at above.
		expect(harness.storageEvents.filter((e) => e.op !== "commit")).toEqual([]);
	});

	it("an admin re-imports the export in upsert mode: every row unchanged and no table changes", async () => {
		const { tenantId, rowCount } = await seedRoundTripTenant();
		const userId = await seedUser();
		const file = await exportAndReparse(harness, tenantId);
		const before = await tenantSnapshot(tenantId);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "admin",
			mode: "upsert",
			header: file.header,
			rows: file.rows,
		});

		expect(result).toEqual({
			ok: true,
			mode: "upsert",
			created: 0,
			updated: 0,
			unchanged: rowCount,
			ignoredColumns: expect.any(Array),
		});
		expect(await tenantSnapshot(tenantId)).toEqual(before);
		// No file deleted or promoted; an observation would also have moved updated_at above.
		expect(harness.storageEvents.filter((e) => e.op !== "commit")).toEqual([]);
	});

	// Real data can hold a legacy hip_* id that Phase M never mapped (DEF-055 residual).
	it("an unmigrated row whose legacy HIP id has no taxonomy entry still re-imports as unchanged", async () => {
		const tenantId = await seedCountryAccount();
		const userId = await seedUser();
		const unmappedHip = await seedHipChain();
		await seedLegacyEvent({
			tenantId,
			hip: unmappedHip,
			approvalStatus: "validated",
		});
		const file = await exportAndReparse(harness, tenantId);
		const before = await tenantSnapshot(tenantId);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "data-collector",
			mode: "update",
			header: file.header,
			rows: file.rows,
		});

		expect(result.ok === false ? result.rowErrors : []).toEqual([]);
		expect(result).toMatchObject({
			ok: true,
			created: 0,
			updated: 0,
			unchanged: 1,
		});
		expect(await tenantSnapshot(tenantId)).toEqual(before);
	});
});
