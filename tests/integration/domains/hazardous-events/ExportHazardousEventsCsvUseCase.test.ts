import "../../db/setup";
import { sql } from "drizzle-orm";
import { parse } from "csv-parse/sync";
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
import { serializeCsv } from "~/domains/hazardous-events/presentation/web/csv/serializeCsv";
import {
	seedCountryAccount,
	seedHipChain,
} from "../../db/models/hazardousEventTestHelpers";
import {
	E1_HEADER,
	RecordingLogger,
	buildCsvHarness,
	exportAndReparse,
	seedCaEvent,
	seedLegacyEvent,
	seedLegacyParentLink,
	seedTaxonomyWithRefs,
	seedUser,
	type CsvHarness,
} from "./hazardousEventCsvTestHarness";

vi.setConfig({ testTimeout: 30_000 });

let harness: CsvHarness;
let logger: RecordingLogger;

beforeAll(async () => {
	await dr.execute(sql`select 1`);
}, 60_000);

beforeEach(() => {
	logger = new RecordingLogger();
	harness = buildCsvHarness(logger);
});

afterEach(() => {
	harness.cleanup();
});

/** One exported record as a column → cell map. */
function byColumn(header: readonly string[], row: readonly string[]) {
	return Object.fromEntries(header.map((column, i) => [column, row[i]]));
}

async function exportedRecords(tenantId: string) {
	const exported = await harness.exportUseCase.execute({ tenantId });
	return exported.rows.map((row) => byColumn(exported.header, row));
}

describe("export contains every event of the session tenant", () => {
	it("drafts and published events are both exported", async () => {
		const tenantId = await seedCountryAccount();
		const tax = await seedTaxonomyWithRefs();
		const draft = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			workflow: "DRAFT",
		});
		const published = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			workflow: "PUBLISHED",
		});

		const records = await exportedRecords(tenantId);

		const statusById = Object.fromEntries(
			records.map((record) => [record.id, record.approvalStatus]),
		);
		expect(statusById).toEqual({ [draft]: "draft", [published]: "published" });
	});

	it("another tenant's events are not exported", async () => {
		const tenantId = await seedCountryAccount();
		const otherTenant = await seedCountryAccount();
		const tax = await seedTaxonomyWithRefs();
		const own = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		await seedCaEvent(harness, {
			tenantId: otherTenant,
			specificHazardId: tax.specificHazardId,
		});
		await seedLegacyEvent({ tenantId: otherTenant });

		const records = await exportedRecords(tenantId);

		expect(records.map((record) => record.id)).toEqual([own]);
		expect(records.every((r) => r.countryAccountsId === tenantId)).toBe(true);
	});

	it("rows are ordered by id ascending", async () => {
		const tenantId = await seedCountryAccount();
		const tax = await seedTaxonomyWithRefs();
		for (let i = 0; i < 4; i += 1) {
			await seedCaEvent(harness, {
				tenantId,
				specificHazardId: tax.specificHazardId,
			});
		}

		const ids = (await exportedRecords(tenantId)).map((record) => record.id);

		expect(ids).toEqual([...ids].sort());
	});
});

describe("the export keeps the legacy header and appends parent", () => {
	it("the header is exactly the legacy export header followed by parent", async () => {
		const tenantId = await seedCountryAccount();

		const exported = await harness.exportUseCase.execute({ tenantId });

		expect([...exported.header]).toEqual([...E1_HEADER, "parent"]);
		expect(exported.header).not.toContain("spatialFootprint");
		expect(exported.header).not.toContain("attachments");
	});

	it("an empty tenant gives a header-only file", async () => {
		const tenantId = await seedCountryAccount();

		const exported = await harness.exportUseCase.execute({ tenantId });
		const text = serializeCsv(exported.header, exported.rows);

		expect(exported).toMatchObject({ rows: [], count: 0 });
		expect(text).toBe(`${[...E1_HEADER, "parent"].join(",")}\r\n`);
	});
});

describe("values come from the CA model, falling back to legacy data", () => {
	it("a pre-Phase-M row exports its legacy HIP ids, legacy approvalStatus and event_relationship parent", async () => {
		const tenantId = await seedCountryAccount();
		const hip = await seedHipChain();
		const parent = await seedLegacyEvent({ tenantId });
		const legacy = await seedLegacyEvent({
			tenantId,
			hip,
			approvalStatus: "validated",
		});
		await seedLegacyParentLink(parent, legacy);

		const record = (await exportedRecords(tenantId)).find(
			(r) => r.id === legacy,
		);

		expect(record).toMatchObject({
			hipHazardId: hip.hipHazardId,
			hipClusterId: hip.hipClusterId,
			hipTypeId: hip.hipTypeId,
			approvalStatus: "validated",
			parent,
			specificHazardId: "",
		});
	});

	it("a CA-created published event exports published and its taxonomy source refs", async () => {
		const tenantId = await seedCountryAccount();
		const userId = await seedUser();
		const tax = await seedTaxonomyWithRefs();
		const created = await harness.createUseCase.execute({
			tenantId,
			specificHazardId: tax.specificHazardId,
			startDate: "2025-01-01",
			endDate: "2025-01-02",
			nationalSpecification: "",
			description: "",
			chainsExplanation: "",
			magnitude: "",
			recordOriginator: "Field survey",
			dataSource: "",
			hazardousEventStatus: null,
			specificHazardLocalName: null,
			specificHazardNationalName: null,
			apiImportId: null,
			actingUserId: userId,
			hazardDriverIds: [],
			attachments: [],
			fieldValues: [],
			customFieldValues: [],
		});
		await harness.transactionRunner.run((tx) =>
			harness.applyImportedWorkflowStatusUseCase.execute({
				entityId: created.id,
				entityType: "HE",
				tenantId,
				targetStatus: "PUBLISHED",
				actingUserId: userId,
				actingUserRole: "admin",
				tx,
			}),
		);

		const [record] = await exportedRecords(tenantId);

		expect(record).toMatchObject({
			id: created.id,
			approvalStatus: "published",
			hipHazardId: tax.hipHazardId,
			hipClusterId: tax.hipClusterId,
			hipTypeId: tax.hipTypeId,
			specificHazardId: tax.specificHazardId,
			publishedByUserId: userId,
			validatedByUserId: userId,
		});
		expect(record.publishedAt).toMatch(
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
		);
	});
});

describe("the file is RFC 4180 CSV in UTF-8", () => {
	it("a description with a comma, quotes and a line break survives an RFC 4180 round trip", async () => {
		const tenantId = await seedCountryAccount();
		const tax = await seedTaxonomyWithRefs();
		const description = 'a, "b"\nc';
		await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { description },
		});

		const file = await exportAndReparse(harness, tenantId);

		expect(file.rows[0][file.header.indexOf("description")]).toBe(description);
		expect(file.text.split("\r\n")[0]).toBe([...E1_HEADER, "parent"].join(","));
	});

	it("non-ASCII text such as Météo-France is preserved through UTF-8", async () => {
		const tenantId = await seedCountryAccount();
		const tax = await seedTaxonomyWithRefs();
		await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { recordOriginator: "Météo-France" },
		});

		const file = await exportAndReparse(harness, tenantId);
		const decoded: string[][] = parse(
			Buffer.from(file.text, "utf8").toString("utf8"),
			{ bom: true, trim: true },
		);

		expect(decoded[1][decoded[0].indexOf("recordOriginator")]).toBe(
			"Météo-France",
		);
		expect(file.text.charCodeAt(0)).not.toBe(0xfeff);
	});
});

describe("exported cells are protected against formula injection", () => {
	it("formula-like user text is guarded only by the serializer, and system values are untouched", async () => {
		const tenantId = await seedCountryAccount();
		const tax = await seedTaxonomyWithRefs();
		const formula = '=HYPERLINK("http://example.invalid")';
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { recordOriginator: formula, magnitude: "-5" },
		});

		const [unguarded] = await exportedRecords(tenantId);
		const file = await exportAndReparse(harness, tenantId);
		const guarded = byColumn(file.header, file.rows[0]);

		expect(unguarded.recordOriginator).toBe(formula);
		expect(unguarded.magnitude).toBe("-5");
		expect(file.text).toContain(`"'=HYPERLINK(""http://example.invalid"")"`);
		expect(guarded.magnitude).toBe("'-5");
		expect(guarded.id).toBe(id);
		expect(guarded.specificHazardId).toBe(tax.specificHazardId);
	});
});

describe("export logs one info line", () => {
	it("a successful export logs exactly one hazardous_events.csv_exported line with its count and no cell values", async () => {
		const tenantId = await seedCountryAccount();
		const tax = await seedTaxonomyWithRefs();
		for (let i = 0; i < 3; i += 1) {
			await seedCaEvent(harness, {
				tenantId,
				specificHazardId: tax.specificHazardId,
				overrides: { description: "secret-cell-value" },
			});
		}

		const exported = await harness.exportUseCase.execute({ tenantId });

		expect(exported.count).toBe(3);
		expect(logger.infoCalls).toEqual([
			{ msg: "hazardous_events.csv_exported", tenantId, count: 3 },
		]);
	});
});
