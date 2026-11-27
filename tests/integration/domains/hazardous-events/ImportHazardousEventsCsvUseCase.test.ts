import "../../db/setup";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { eq, sql } from "drizzle-orm";
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
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { hazardousEventAttachmentTable } from "~/domains/hazardous-events/infrastructure/hazardousEventAttachmentTable";
import { seedCountryAccount } from "../../db/models/hazardousEventTestHelpers";
import {
	E1_HEADER,
	X1_CREATE_HEADER,
	RecordingLogger,
	attachmentRowsOf,
	buildCsvHarness,
	causalityForEffect,
	csvTable,
	currentFootprint,
	eventsOfTenant,
	exportAndReparse,
	globalCounts,
	notificationsFor,
	nullTenantEventCount,
	observationCount,
	runImport,
	seedCaEvent,
	seedCaEventWithFile,
	seedCausalLink,
	seedDivision,
	seedLegacyEvent,
	seedObservation,
	seedTaxonomyWithRefs,
	seedUser,
	tenantSnapshot,
	totalObservationCount,
	workflowFor,
	type CsvHarness,
	type StorageEvent,
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
	vi.restoreAllMocks();
});

type Taxonomy = Awaited<ReturnType<typeof seedTaxonomyWithRefs>>;

async function setupTenant() {
	const tenantId = await seedCountryAccount();
	const userId = await seedUser();
	const tax = await seedTaxonomyWithRefs();
	return { tenantId, userId, tax };
}

const CREATE_HEADER = [
	"startDate",
	"endDate",
	"recordOriginator",
	"hipTypeId",
	"hipClusterId",
	"hipHazardId",
	"apiImportId",
	"description",
];

function createRecord(
	tax: Taxonomy,
	overrides: Record<string, string> = {},
): Record<string, string> {
	return {
		startDate: "2025-03-01",
		endDate: "2025-03-02",
		recordOriginator: "Field survey",
		hipTypeId: tax.hipTypeId,
		hipClusterId: tax.hipClusterId,
		hipHazardId: tax.hipHazardId,
		...overrides,
	};
}

async function eventRow(id: string) {
	const [row] = await dr
		.select()
		.from(hazardousEventTable)
		.where(eq(hazardousEventTable.id, id));
	return row;
}

describe("tenant and acting user come only from the session", () => {
	it("reverses 0e: BUG: the session-derived countryAccountsId argument is silently ignored — hazardousEventCreate only accepts 3 params, csvCreate always calls it with 4", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const nullBefore = await nullTenantEventCount();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(CREATE_HEADER, [
				createRecord(tax, { apiImportId: "no-tenant-col" }),
			]),
		});

		expect(result).toMatchObject({ ok: true, created: 1 });
		const events = await eventsOfTenant(tenantId);
		expect(events).toHaveLength(1);
		expect(events[0].countryAccountsId).toBe(tenantId);
		expect(await nullTenantEventCount()).toBe(nullBefore);
	});

	it("reverses 0e: BUG: a CSV row can specify ANY tenant's countryAccountsId and the record is created under that tenant, regardless of the uploader's own session tenant", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const foreignTenant = await seedCountryAccount();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(
				[...CREATE_HEADER, "countryAccountsId"],
				[createRecord(tax, { countryAccountsId: foreignTenant })],
			),
		});

		expect(result).toMatchObject({ ok: true, created: 1 });
		expect(result.ignoredColumns).toContain("countryAccountsId");
		const events = await eventsOfTenant(tenantId);
		expect(events).toHaveLength(1);
		expect(events[0].countryAccountsId).toBe(tenantId);
		expect(await eventsOfTenant(foreignTenant)).toHaveLength(0);
	});

	it("reverses 0e: BUG: the same signature mismatch lets a CSV 'update' row's countryAccountsId column override which tenant's guard is checked, not the uploader's session", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const targetTenant = await seedCountryAccount();
		const target = await seedCaEvent(harness, {
			tenantId: targetTenant,
			specificHazardId: tax.specificHazardId,
		});
		const before = await tenantSnapshot(targetTenant);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "recordOriginator", "countryAccountsId"],
			rows: [[target, "hijacked via csv update", targetTenant]],
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [expect.objectContaining({ line: 2, code: "not_found" })],
		});
		expect(await tenantSnapshot(targetTenant)).toEqual(before);
	});

	it("reverses 0e: BUG: hazardousEventIdByImportId (wired as idByImportIdAndCountryAccountsId) has no tenant filter — anyone who knows a colliding apiImportId AND the target's countryAccountsId can overwrite another tenant's record instead of creating a new one", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const victimTenant = await seedCountryAccount();
		const victim = await seedCaEvent(harness, {
			tenantId: victimTenant,
			specificHazardId: tax.specificHazardId,
			overrides: {
				apiImportId: "SHARED-IMPORT-ID",
				recordOriginator: "Victim's original record",
			},
		});
		const victimBefore = await eventRow(victim);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "upsert",
			...csvTable(
				[...CREATE_HEADER, "countryAccountsId"],
				[
					createRecord(tax, {
						apiImportId: "SHARED-IMPORT-ID",
						recordOriginator: "overwritten by attacker",
						countryAccountsId: victimTenant,
					}),
				],
			),
		});

		expect(result).toMatchObject({ ok: true, created: 1, updated: 0 });
		const own = await eventsOfTenant(tenantId);
		expect(own).toHaveLength(1);
		expect(own[0].apiImportId).toBe("SHARED-IMPORT-ID");
		expect(own[0].recordOriginator).toBe("overwritten by attacker");
		expect(await eventRow(victim)).toEqual(victimBefore);
	});
});

describe("legacy CSV files and templates are accepted", () => {
	it("a legacy create template file (X1 header) with valid HIP ids imports one event", async () => {
		const { tenantId, userId, tax } = await setupTenant();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(X1_CREATE_HEADER, [
				{
					hipHazardId: tax.hipHazardId,
					hipClusterId: tax.hipClusterId,
					hipTypeId: tax.hipTypeId,
					approvalStatus: "draft",
					startDate: "2025-01-01",
					endDate: "2025-01-02",
					description: "text example",
					recordOriginator: "text example",
					hazardousEventStatus: "forecasted",
				},
			]),
		});

		expect(result).toMatchObject({ ok: true, created: 1 });
		expect(await eventsOfTenant(tenantId)).toHaveLength(1);
	});

	it("a legacy export file (E1 header) passes header validation in update mode", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		const exported = await harness.exportUseCase.execute({ tenantId });
		const rows = exported.rows.map((row) =>
			E1_HEADER.map((column) => row[exported.header.indexOf(column)]),
		);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: E1_HEADER,
			rows,
		});

		expect(result).toMatchObject({ ok: true, unchanged: 1 });
	});

	it("an unknown column rejects the file with unknown_column and writes nothing", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const before = await globalCounts();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(
				[...CREATE_HEADER, "unknownCol"],
				[createRecord(tax, { unknownCol: "x" })],
			),
		});

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.fileErrors).toContainEqual(
			expect.objectContaining({ code: "unknown_column", column: "unknownCol" }),
		);
		expect(await globalCounts()).toEqual(before);
	});

	it("an id column in create mode rejects the file with unknown_column", async () => {
		const { tenantId, userId, tax } = await setupTenant();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(
				[...CREATE_HEADER, "id"],
				[createRecord(tax, { id: randomUUID() })],
			),
		});

		expect(result.ok === false && result.fileErrors).toContainEqual(
			expect.objectContaining({ code: "unknown_column", column: "id" }),
		);
		expect(await eventsOfTenant(tenantId)).toHaveLength(0);
	});

	it("a duplicated recordOriginator header rejects the file with duplicate_column and writes nothing", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const before = await globalCounts();
		const header = [...CREATE_HEADER, "recordOriginator"];
		const record = createRecord(tax);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			header,
			rows: [header.map((column) => record[column] ?? "")],
		});

		expect(result.ok === false && result.fileErrors).toContainEqual(
			expect.objectContaining({
				code: "duplicate_column",
				column: "recordOriginator",
			}),
		);
		expect(await globalCounts()).toEqual(before);
	});
});

describe("every row is validated before any write", () => {
	it("a bad startDate on line 3 is reported with its line and column and nothing is written", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const before = await globalCounts();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(CREATE_HEADER, [
				createRecord(tax),
				createRecord(tax, { startDate: "2025-13-45" }),
			]),
		});

		expect(result.ok === false && result.rowErrors).toContainEqual(
			expect.objectContaining({
				line: 3,
				column: "startDate",
				code: "invalid_date",
			}),
		);
		expect(await globalCounts()).toEqual(before);
	});

	it("several invalid rows are all reported, in line order", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const header = [...CREATE_HEADER, "hazardousEventStatus"];
		const before = await globalCounts();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(header, [
				createRecord(tax, { recordOriginator: "" }),
				createRecord(tax),
				createRecord(tax, { hazardousEventStatus: "unknown" }),
			]),
		});

		expect(result.ok).toBe(false);
		const errors = result.ok === false ? result.rowErrors : [];
		expect(errors.map((e) => [e.line, e.column])).toEqual([
			[2, "recordOriginator"],
			[4, "hazardousEventStatus"],
		]);
		expect(errors[1].code).toBe("invalid_enum");
		expect(await globalCounts()).toEqual(before);
	});

	it("a duplicated apiImportId on lines 2 and 5 gives duplicate_key on line 5 and nothing is written", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const before = await globalCounts();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "upsert",
			...csvTable(CREATE_HEADER, [
				createRecord(tax, { apiImportId: "A1" }),
				createRecord(tax, { apiImportId: "A2" }),
				createRecord(tax, { apiImportId: "A3" }),
				createRecord(tax, { apiImportId: "A1" }),
			]),
		});

		expect(result.ok === false && result.rowErrors).toContainEqual(
			expect.objectContaining({
				line: 5,
				column: "apiImportId",
				code: "duplicate_key",
			}),
		);
		expect(await globalCounts()).toEqual(before);
	});
});

describe("legacy HIP ids resolve to the CA taxonomy", () => {
	it("a HIP hazard id becomes the matching specific hazard", async () => {
		const { tenantId, userId, tax } = await setupTenant();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(CREATE_HEADER, [createRecord(tax)]),
		});

		expect(result).toMatchObject({ ok: true, created: 1 });
		const [event] = await eventsOfTenant(tenantId);
		expect(event.specificHazardId).toBe(tax.specificHazardId);
	});

	it("a contradictory HIP chain gives hip_mismatch and nothing is written", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const otherTax = await seedTaxonomyWithRefs();
		const before = await globalCounts();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(CREATE_HEADER, [
				createRecord(tax, {
					hipTypeId: "",
					hipClusterId: otherTax.hipClusterId,
				}),
			]),
		});

		expect(result.ok === false && result.rowErrors).toContainEqual(
			expect.objectContaining({ line: 2, code: "hip_mismatch" }),
		);
		expect(await globalCounts()).toEqual(before);
	});

	it("a create row with only hipTypeId and hipClusterId gives specific_hazard_required", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const before = await globalCounts();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(CREATE_HEADER, [createRecord(tax, { hipHazardId: "" })]),
		});

		expect(result.ok === false && result.rowErrors).toContainEqual(
			expect.objectContaining({ line: 2, code: "specific_hazard_required" }),
		);
		expect(await globalCounts()).toEqual(before);
	});
});

describe("legacy approval status maps to the CA workflow status", () => {
	const STATUS_HEADER = [...CREATE_HEADER, "approvalStatus"];

	it("an admin's published row arrives PUBLISHED, attributed to the uploader at import time, with no notification", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const startedAt = new Date();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "admin",
			mode: "create",
			...csvTable(STATUS_HEADER, [
				createRecord(tax, { approvalStatus: "published" }),
			]),
		});
		const finishedAt = new Date();

		expect(result).toMatchObject({ ok: true, created: 1 });
		const [event] = await eventsOfTenant(tenantId);
		const workflow = await workflowFor(event.id);
		expect(workflow.status).toBe("PUBLISHED");
		expect(workflow.validatedByUserId).toBe(userId);
		expect(workflow.publishedByUserId).toBe(userId);
		for (const at of [workflow.validatedAt, workflow.publishedAt]) {
			expect(at?.getTime()).toBeGreaterThanOrEqual(startedAt.getTime());
			expect(at?.getTime()).toBeLessThanOrEqual(finishedAt.getTime());
		}
		expect(await notificationsFor(workflow.id)).toHaveLength(0);
	});

	it("a data-collector's published row gives status_not_permitted and nothing is written", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const before = await globalCounts();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "data-collector",
			mode: "create",
			...csvTable(STATUS_HEADER, [
				createRecord(tax, { approvalStatus: "published" }),
			]),
		});

		expect(result.ok === false && result.rowErrors).toContainEqual(
			expect.objectContaining({ line: 2, code: "status_not_permitted" }),
		);
		expect(await globalCounts()).toEqual(before);
	});

	it("an empty approvalStatus becomes a DRAFT workflow", async () => {
		const { tenantId, userId, tax } = await setupTenant();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(STATUS_HEADER, [createRecord(tax, { approvalStatus: "" })]),
		});

		expect(result).toMatchObject({ ok: true, created: 1 });
		const [event] = await eventsOfTenant(tenantId);
		expect((await workflowFor(event.id)).status).toBe("DRAFT");
	});

	it("changing a PUBLISHED event's description gives not_editable and nothing is written", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			workflow: "PUBLISHED",
		});
		const before = await tenantSnapshot(tenantId);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "admin",
			mode: "update",
			header: ["id", "description", "approvalStatus"],
			rows: [[id, "changed", "published"]],
		});

		expect(result.ok === false && result.rowErrors).toContainEqual(
			expect.objectContaining({ line: 2, code: "not_editable" }),
		);
		expect(await tenantSnapshot(tenantId)).toEqual(before);
	});

	it("moving a PUBLISHED event back to draft gives status_change_not_supported and nothing is written", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			workflow: "PUBLISHED",
		});
		const before = await tenantSnapshot(tenantId);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "admin",
			mode: "update",
			header: ["id", "approvalStatus"],
			rows: [[id, "draft"]],
		});

		expect(result.ok === false && result.rowErrors).toContainEqual(
			expect.objectContaining({
				line: 2,
				code: "status_change_not_supported",
			}),
		);
		expect(await tenantSnapshot(tenantId)).toEqual(before);
	});

	it("an admin can move a DRAFT event to published by CSV, with no notification", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			workflow: "DRAFT",
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "admin",
			mode: "update",
			header: ["id", "approvalStatus"],
			rows: [[id, "published"]],
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		const workflow = await workflowFor(id);
		expect(workflow.status).toBe("PUBLISHED");
		expect(await notificationsFor(workflow.id)).toHaveLength(0);
	});
});

describe("re-importing unchanged data is idempotent", () => {
	it("re-running the same upsert file reports created 0, updated 0, every row unchanged, and writes nothing", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const file = csvTable(
			[...CREATE_HEADER, "approvalStatus"],
			[
				createRecord(tax, {
					apiImportId: "ONB-1",
					approvalStatus: "published",
				}),
				createRecord(tax, { apiImportId: "ONB-2", approvalStatus: "" }),
			],
		);
		const first = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "upsert",
			...file,
		});
		expect(first).toMatchObject({ ok: true, created: 2 });
		const before = await tenantSnapshot(tenantId);

		const second = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "upsert",
			...file,
		});

		expect(second).toMatchObject({
			ok: true,
			created: 0,
			updated: 0,
			unchanged: 2,
		});
		expect(await tenantSnapshot(tenantId)).toEqual(before);
	});

	it("a guarded cell round-trips: exported '-5 and '=A1 re-import in upsert mode as unchanged", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { magnitude: "-5", apiImportId: "=A1" },
		});
		const file = await exportAndReparse(harness, tenantId);
		const row = file.rows[0];
		expect(row[file.header.indexOf("magnitude")]).toBe("'-5");
		expect(row[file.header.indexOf("apiImportId")]).toBe("'=A1");
		const before = await tenantSnapshot(tenantId);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "upsert",
			header: file.header,
			rows: file.rows,
		});

		expect(result).toMatchObject({
			ok: true,
			created: 0,
			updated: 0,
			unchanged: 1,
		});
		expect(await tenantSnapshot(tenantId)).toEqual(before);
	});
});

describe("parent becomes the CA cause link", () => {
	const PARENT_HEADER = [...CREATE_HEADER, "parent"];

	it("a same-tenant parent that starts earlier links the new event as its effect", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const parent = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { startDate: "2025-01-01" },
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(PARENT_HEADER, [
				createRecord(tax, { startDate: "2025-02-01", parent }),
			]),
		});

		expect(result).toMatchObject({ ok: true, created: 1 });
		const created = (await eventsOfTenant(tenantId)).find(
			(row) => row.id !== parent,
		);
		const links = await causalityForEffect(created?.id ?? "");
		expect(links).toHaveLength(1);
		expect(links[0].causeHazardousEventId).toBe(parent);
	});

	it("a parent that starts after the row's startDate gives cause_after_effect and nothing is written", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const parent = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { startDate: "2026-06-01", endDate: "2026-06-02" },
		});
		const before = await globalCounts();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(PARENT_HEADER, [
				createRecord(tax, { startDate: "2025-01-01", parent }),
			]),
		});

		expect(result.ok === false && result.rowErrors).toContainEqual(
			expect.objectContaining({ line: 2, code: "cause_after_effect" }),
		);
		expect(await globalCounts()).toEqual(before);
	});

	it("an update that would close a cycle gives conflict on column parent and nothing is written", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const a = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		const b = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		await seedCausalLink(a, b);
		const before = await tenantSnapshot(tenantId);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "parent"],
			rows: [[a, b]],
		});

		expect(result.ok === false && result.rowErrors).toContainEqual(
			expect.objectContaining({ line: 2, column: "parent", code: "conflict" }),
		);
		expect(await tenantSnapshot(tenantId)).toEqual(before);
	});

	it("an empty parent cell on update clears the cause link", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const cause = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		const effect = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		await seedCausalLink(cause, effect);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "parent"],
			rows: [[effect, ""]],
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		expect(await causalityForEffect(effect)).toHaveLength(0);
	});

	it("an absent parent column on update leaves the cause link unchanged", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const cause = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		const effect = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		await seedCausalLink(cause, effect);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "description"],
			rows: [[effect, "new description"]],
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		const links = await causalityForEffect(effect);
		expect(links).toHaveLength(1);
		expect(links[0].causeHazardousEventId).toBe(cause);
	});
});

describe("spatialFootprint becomes a tenant-checked CA spatial observation (6d-2)", () => {
	const POINT = { type: "Point", coordinates: [77.2, 28.6] };
	const POLYGON = {
		type: "Polygon",
		coordinates: [
			[
				[77, 28],
				[78, 28],
				[78, 29],
				[77, 28],
			],
		],
	};

	function footprintCell(items: unknown[]): string {
		return JSON.stringify(items);
	}

	function pointItem(point: unknown = POINT) {
		return {
			map_option: "Map coordinates",
			geojson: { type: "Feature", geometry: point, properties: {} },
		};
	}

	function divisionItem(divisionId: string) {
		return {
			map_option: "Geographic level",
			geojson: { properties: { division_id: divisionId } },
		};
	}

	const FOOTPRINT_HEADER = [...CREATE_HEADER, "spatialFootprint"];

	it("Scenario: A legacy footprint creates an observation at the import time, shared by every row", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const division = await seedDivision(tenantId);
		const before = Date.now();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(FOOTPRINT_HEADER, [
				createRecord(tax, {
					apiImportId: "fp-1",
					spatialFootprint: footprintCell([
						pointItem(),
						divisionItem(division),
					]),
				}),
				createRecord(tax, {
					apiImportId: "fp-2",
					spatialFootprint: footprintCell([
						{ map_option: "Map coordinates", geojson: POLYGON },
						{ map_option: "Geographic level", division_id: division },
					]),
				}),
			]),
		});
		const after = Date.now();

		expect(result).toMatchObject({ ok: true, created: 2 });
		const events = await eventsOfTenant(tenantId);
		const byImportId = new Map(events.map((e) => [e.apiImportId, e.id]));
		const first = await currentFootprint(
			harness,
			tenantId,
			byImportId.get("fp-1") as string,
		);
		const second = await currentFootprint(
			harness,
			tenantId,
			byImportId.get("fp-2") as string,
		);
		expect(first?.geometries).toStrictEqual([POINT]);
		expect(first?.divisionIds).toStrictEqual([division]);
		expect(second?.geometries).toStrictEqual([POLYGON]);
		expect(second?.divisionIds).toStrictEqual([division]);
		const time = first?.observationTime.getTime() ?? 0;
		expect(time).toBeGreaterThanOrEqual(before);
		expect(time).toBeLessThanOrEqual(after);
		expect(second?.observationTime.getTime()).toBe(time);
		expect(harness.logger.messages()).toContain("spatial_observation.recorded");
	});

	it("Scenario: Another tenant's division, or one that exists nowhere, is rejected and nothing is written", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const otherTenant = await seedCountryAccount();
		const foreignDivision = await seedDivision(otherTenant);
		const missingDivision = randomUUID();
		const countsBefore = await globalCounts();
		const observationsBefore = await totalObservationCount();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(FOOTPRINT_HEADER, [
				createRecord(tax, {
					spatialFootprint: footprintCell([divisionItem(foreignDivision)]),
				}),
				createRecord(tax, {
					spatialFootprint: footprintCell([divisionItem(missingDivision)]),
				}),
			]),
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [
				{
					line: 2,
					code: "invalid_division",
					column: "spatialFootprint",
					value: foreignDivision,
				},
				{
					line: 3,
					code: "invalid_division",
					column: "spatialFootprint",
					value: missingDivision,
				},
			],
		});
		expect(await globalCounts()).toEqual(countsBefore);
		expect(await totalObservationCount()).toBe(observationsBefore);
	});

	it("Scenario: A malformed footprint is rejected before any write", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const countsBefore = await globalCounts();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(FOOTPRINT_HEADER, [
				createRecord(tax),
				createRecord(tax, { spatialFootprint: "{not json" }),
				createRecord(tax, {
					spatialFootprint: footprintCell([
						pointItem({ type: "Point", coordinates: "x" }),
					]),
				}),
			]),
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [
				{ line: 3, code: "invalid_spatial_footprint" },
				{ line: 4, code: "invalid_spatial_footprint" },
			],
		});
		expect(await globalCounts()).toEqual(countsBefore);
	});

	it("L9: [] on the create path records no observation, nor does an empty cell", async () => {
		const { tenantId, userId, tax } = await setupTenant();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(FOOTPRINT_HEADER, [
				createRecord(tax, { spatialFootprint: "[]" }),
				createRecord(tax, { spatialFootprint: "" }),
			]),
		});

		expect(result).toMatchObject({ ok: true, created: 2 });
		for (const event of await eventsOfTenant(tenantId)) {
			expect(await observationCount(event.id)).toBe(0);
		}
	});

	it("Scenario: An unchanged footprint records nothing, even reformatted and reordered", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const division = await seedDivision(tenantId);
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		await seedObservation(harness, {
			tenantId,
			eventId: id,
			geometries: [POINT, POLYGON],
			divisionIds: [division],
		});
		const updatedAtBefore = (await eventRow(id)).updatedAt;

		const exported = await exportAndReparse(harness, tenantId);
		const reimport = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: exported.header,
			rows: exported.rows,
		});
		const reordered = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "spatialFootprint"],
			rows: [
				[
					id,
					JSON.stringify(
						[
							{ map_option: "Geographic level", division_id: division },
							{ map_option: "Map coordinates", geojson: POLYGON },
							pointItem(),
						],
						null,
						2,
					),
				],
			],
		});

		expect(reimport).toMatchObject({ ok: true, updated: 0, unchanged: 1 });
		expect(reordered).toMatchObject({ ok: true, updated: 0, unchanged: 1 });
		expect(await observationCount(id)).toBe(1);
		expect((await eventRow(id)).updatedAt).toEqual(updatedAtBefore);
	});

	it("Scenario: [] clears a non-empty footprint once, then is unchanged", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		await seedObservation(harness, {
			tenantId,
			eventId: id,
			geometries: [POINT],
		});
		const file = {
			header: ["id", "spatialFootprint"],
			rows: [[id, "[]"]],
		};

		const first = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			...file,
		});
		const second = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			...file,
		});

		expect(first).toMatchObject({ ok: true, updated: 1 });
		expect(second).toMatchObject({ ok: true, updated: 0, unchanged: 1 });
		expect(await observationCount(id)).toBe(2);
		const current = await currentFootprint(harness, tenantId, id);
		expect(current?.geometries).toStrictEqual([]);
		expect(current?.divisionIds).toStrictEqual([]);
	});

	it("a changed footprint on update records one new observation at the import time", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		await seedObservation(harness, {
			tenantId,
			eventId: id,
			geometries: [POINT],
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "spatialFootprint"],
			rows: [[id, footprintCell([pointItem(POLYGON)])]],
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		expect(await observationCount(id)).toBe(2);
		expect(
			(await currentFootprint(harness, tenantId, id))?.geometries,
		).toStrictEqual([POLYGON]);
	});

	it("Scenario: A changed footprint on a published event is not editable", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			workflow: "PUBLISHED",
		});
		const before = await tenantSnapshot(tenantId);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "data-collector",
			mode: "update",
			header: ["id", "spatialFootprint"],
			rows: [[id, footprintCell([pointItem()])]],
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [{ line: 2, code: "not_editable" }],
		});
		expect(await tenantSnapshot(tenantId)).toEqual(before);
		expect(await observationCount(id)).toBe(0);
	});

	it("OD-9: a current observation dated after the import gives conflict on spatialFootprint", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		await seedObservation(harness, {
			tenantId,
			eventId: id,
			geometries: [POINT],
			observationTime: new Date(Date.now() + 86_400_000),
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "spatialFootprint"],
			rows: [[id, footprintCell([pointItem(POLYGON)])]],
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [{ line: 2, code: "conflict", column: "spatialFootprint" }],
		});
		expect(await observationCount(id)).toBe(1);
	});

	it("an unchanged row whose stored footprint names a since-foreign division still re-imports (D10)", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const division = await seedDivision(tenantId);
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		await seedObservation(harness, {
			tenantId,
			eventId: id,
			geometries: [],
			divisionIds: [division],
		});
		const exported = await exportAndReparse(harness, tenantId);
		// The division moves to another tenant after the export.
		const otherTenant = await seedCountryAccount();
		await dr
			.update(divisionTable)
			.set({ countryAccountsId: otherTenant })
			.where(eq(divisionTable.id, division));

		const unchanged = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: exported.header,
			rows: exported.rows,
		});
		const descriptionColumn = exported.header.indexOf("description");
		const changedRow = [...exported.rows[0]];
		changedRow[descriptionColumn] = "edited";
		const changed = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: exported.header,
			rows: [changedRow],
		});

		expect(unchanged).toMatchObject({ ok: true, unchanged: 1 });
		// Deferred errors apply row-wide once the row is not unchanged (spec text).
		expect(changed).toMatchObject({
			ok: false,
			rowErrors: [
				{
					line: 2,
					code: "invalid_division",
					column: "spatialFootprint",
					value: division,
				},
			],
		});
	});

	it("Scenario: An update without the column keeps the footprint (no L13 wipe)", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		await seedObservation(harness, {
			tenantId,
			eventId: id,
			geometries: [POINT],
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "description"],
			rows: [[id, "changed description"]],
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		expect(await observationCount(id)).toBe(1);
		expect(
			(await currentFootprint(harness, tenantId, id))?.geometries,
		).toStrictEqual([POINT]);
	});
});

describe("attachments become CA attachments: http(s) links and the event's own files (6d-2)", () => {
	const ATTACHMENT_HEADER = [...CREATE_HEADER, "attachments"];

	function cell(items: unknown[]): string {
		return JSON.stringify(items);
	}

	function linkItem(url: string, title = "Report") {
		return {
			id: "1",
			title,
			tag: [{ id: "t", name: "Tag" }],
			file_option: "Link",
			url,
		};
	}

	function fileItem(name: string, title = "Scan") {
		return {
			id: "2",
			title,
			tag: null,
			file_option: "File",
			file: { name, content_type: "application/pdf" },
		};
	}

	function uploadListing(root: string): string[] {
		const out: string[] = [];
		const walk = (dir: string) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const full = path.join(dir, entry.name);
				out.push(full);
				if (entry.isDirectory()) walk(full);
			}
		};
		walk(root);
		return out.sort();
	}

	function deletesOf(events: StorageEvent[]) {
		return events.filter((e) => e.op === "delete");
	}

	it("Scenario: A legacy file with an https link creates a Link attachment", async () => {
		const { tenantId, userId, tax } = await setupTenant();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(ATTACHMENT_HEADER, [
				createRecord(tax, {
					attachments: cell([linkItem("https://example.com/a")]),
				}),
			]),
		});

		expect(result).toMatchObject({ ok: true, created: 1 });
		const [event] = await eventsOfTenant(tenantId);
		const rows = await attachmentRowsOf(event.id);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			type: "Link",
			title: "Report",
			tag: [{ id: "t", name: "Tag" }],
			url: "https://example.com/a",
		});
		expect(harness.storageEvents.filter((e) => e.op !== "commit")).toEqual([]);
	});

	it("Scenario: Dangerous link schemes are rejected and nothing is written", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const countsBefore = await globalCounts();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(ATTACHMENT_HEADER, [
				createRecord(tax, {
					attachments: cell([linkItem("javascript:alert(1)")]),
				}),
				createRecord(tax, {
					attachments: cell([linkItem("data:text/html,x")]),
				}),
			]),
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [
				{
					line: 2,
					code: "invalid_attachment_url",
					value: "javascript:alert(1)",
				},
				{ line: 3, code: "invalid_attachment_url", value: "data:text/html,x" },
			],
		});
		expect(await globalCounts()).toEqual(countsBefore);
	});

	it("Scenario: A File item on create is not supported -- no promote, no file or directory", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const listingBefore = uploadListing(harness.uploadRoot);
		const countsBefore = await globalCounts();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(ATTACHMENT_HEADER, [
				createRecord(tax, {
					attachments: cell([fileItem("/uploads/temp/report.pdf")]),
				}),
			]),
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [
				{
					line: 2,
					code: "file_reference_not_supported",
					column: "attachments",
					value: "report.pdf",
				},
			],
		});
		expect(await globalCounts()).toEqual(countsBefore);
		expect(harness.storageEvents).toEqual([]);
		expect(uploadListing(harness.uploadRoot)).toEqual(listingBefore);
	});

	it("an upsert row taking the create path rejects a File item the same way", async () => {
		const { tenantId, userId, tax } = await setupTenant();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "upsert",
			...csvTable(ATTACHMENT_HEADER, [
				createRecord(tax, {
					apiImportId: "NEW-WITH-FILE",
					attachments: cell([fileItem("/uploads/hazardous-event/x/k.pdf")]),
				}),
			]),
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [
				{ line: 2, code: "file_reference_not_supported", value: "k.pdf" },
			],
		});
		expect(await eventsOfTenant(tenantId)).toHaveLength(0);
		expect(harness.storageEvents).toEqual([]);
	});

	it("Scenario: A File item naming the event's own file keeps it, with the new title and stored metadata", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const { id, fileKey, filePath } = await seedCaEventWithFile(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			links: [{ title: "Situation report", url: "https://example.com/r" }],
		});
		const [storedFile] = (await attachmentRowsOf(id)).filter(
			(row) => row.type === "File",
		);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "attachments"],
			rows: [
				[id, cell([fileItem(`/uploads/tenant-other/x/${fileKey}`, "Renamed")])],
			],
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		const rows = await attachmentRowsOf(id);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			type: "File",
			title: "Renamed",
			fileKey,
			fileName: storedFile.fileName,
			fileType: storedFile.fileType,
			fileSize: storedFile.fileSize,
		});
		expect(deletesOf(harness.storageEvents)).toEqual([]);
		expect(harness.storageEvents.some((e) => e.op === "promote")).toBe(false);
		expect(fs.existsSync(filePath)).toBe(true);
	});

	it("Scenario: A File item naming another event's file is rejected and nothing is written", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const holder = await seedCaEventWithFile(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		const other = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		const before = await tenantSnapshot(tenantId);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "attachments"],
			rows: [[other, cell([fileItem(`/x/${holder.fileKey}`)])]],
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [
				{
					line: 2,
					code: "file_reference_not_supported",
					value: holder.fileKey,
				},
			],
		});
		expect(await tenantSnapshot(tenantId)).toEqual(before);
		expect(await attachmentRowsOf(other)).toHaveLength(0);
	});

	it("a malformed tag never reaches storage, so the detail page cannot receive one", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		const countsBefore = await globalCounts();

		const created = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(ATTACHMENT_HEADER, [
				createRecord(tax, {
					attachments: cell([
						{ ...linkItem("https://a.example"), tag: [null] },
					]),
				}),
			]),
		});
		const updated = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "attachments"],
			rows: [[id, cell([{ ...linkItem("https://a.example"), tag: ["Tag"] }])]],
		});

		expect(created).toMatchObject({
			ok: false,
			rowErrors: [{ line: 2, code: "invalid_attachments" }],
		});
		expect(updated).toMatchObject({
			ok: false,
			rowErrors: [{ line: 2, code: "invalid_attachments" }],
		});
		expect(await globalCounts()).toEqual(countsBefore);
		expect(await attachmentRowsOf(id)).toEqual([]);
	});

	it("Scenario: An object instead of an array is rejected", async () => {
		const { tenantId, userId, tax } = await setupTenant();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(ATTACHMENT_HEADER, [
				createRecord(tax, {
					attachments: JSON.stringify(linkItem("https://a.example")),
				}),
			]),
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [
				{ line: 2, code: "invalid_attachments", column: "attachments" },
			],
		});
	});

	it("Scenario: An unchanged attachment set is not rewritten -- other order, no ids", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const { id, fileKey } = await seedCaEventWithFile(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			links: [{ title: "Situation report", url: "https://example.com/r" }],
		});
		const rowsBefore = await attachmentRowsOf(id);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "attachments"],
			rows: [
				[
					id,
					cell([
						{
							title: "Situation report",
							file_option: "Link",
							url: "https://example.com/r",
						},
						{
							title: "Scan",
							tag: [],
							file_option: "File",
							file: { name: fileKey },
						},
					]),
				],
			],
		});

		expect(result).toMatchObject({ ok: true, updated: 0, unchanged: 1 });
		expect((await attachmentRowsOf(id)).map((row) => row.id).sort()).toEqual(
			rowsBefore.map((row) => row.id).sort(),
		);
		expect(harness.storageEvents.filter((e) => e.op !== "commit")).toEqual([]);
	});

	it("Scenario: An unchanged row holding a non-http link re-imports; changing that row is rejected", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		// Written as the he-preview form stored links before SA-1.
		await dr.insert(hazardousEventAttachmentTable).values({
			hazardousEventId: id,
			title: "Old link",
			type: "Link",
			url: "ftp://example.com/f",
		});
		const exported = await exportAndReparse(harness, tenantId);
		const column = (name: string) => exported.header.indexOf(name);

		const unchanged = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: exported.header,
			rows: exported.rows,
		});
		const keepsLink = [...exported.rows[0]];
		keepsLink[column("attachments")] = cell([
			{ title: "Old link", file_option: "Link", url: "ftp://example.com/f" },
			linkItem("https://example.com/new"),
		]);
		const changesAttachments = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: exported.header,
			rows: [keepsLink],
		});
		const changesDescription = [...exported.rows[0]];
		changesDescription[column("description")] = "edited";
		const changesOtherColumn = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: exported.header,
			rows: [changesDescription],
		});

		expect(unchanged).toMatchObject({ ok: true, unchanged: 1 });
		expect(changesAttachments).toMatchObject({
			ok: false,
			rowErrors: [
				{
					line: 2,
					code: "invalid_attachment_url",
					value: "ftp://example.com/f",
				},
			],
		});
		// Row-level, per the spec text: any change to the row applies the attachment rules.
		expect(changesOtherColumn).toMatchObject({
			ok: false,
			rowErrors: [{ line: 2, code: "invalid_attachment_url" }],
		});
	});

	it("Scenario: A rolled-back import deletes no file and calls no promote", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const { id, fileKey, filePath } = await seedCaEventWithFile(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "attachments"],
			rows: [
				[id, "[]"],
				[randomUUID(), "[]"],
			],
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [{ line: 3, code: "not_found" }],
		});
		expect((await attachmentRowsOf(id)).map((row) => row.fileKey)).toEqual([
			fileKey,
		]);
		expect(harness.storageEvents).toEqual([]);
		expect(fs.existsSync(filePath)).toBe(true);
	});

	it("Scenario: Files are deleted after commit, exactly once", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const { id, fileKey, filePath } = await seedCaEventWithFile(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "attachments"],
			rows: [[id, "[]"]],
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		expect(await attachmentRowsOf(id)).toHaveLength(0);
		expect(harness.storageEvents).toEqual([
			{ op: "commit" },
			{ op: "delete", ownerId: id, fileKey },
		]);
		expect(fs.existsSync(filePath)).toBe(false);
	});

	it("Scenario: A deletion failure after commit keeps the import successful and logs delete_failed", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const { id, fileKey } = await seedCaEventWithFile(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		harness.attachmentStoragePort.failDelete = true;

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "attachments"],
			rows: [[id, "[]"]],
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		const failures = harness.logger.errorCalls.filter(
			(call) => call.msg === "hazardous_event_attachment.delete_failed",
		);
		expect(failures).toHaveLength(1);
		expect(failures[0]).toMatchObject({ fileKey, ownerId: id, tenantId });
	});

	it("Scenario: An update without the columns keeps footprint, attachments and files", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const { id, fileKey, filePath } = await seedCaEventWithFile(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		await seedObservation(harness, {
			tenantId,
			eventId: id,
			geometries: [{ type: "Point", coordinates: [1, 2] }],
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "description"],
			rows: [[id, "changed description"]],
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		expect(await observationCount(id)).toBe(1);
		expect((await attachmentRowsOf(id)).map((row) => row.fileKey)).toEqual([
			fileKey,
		]);
		expect(deletesOf(harness.storageEvents)).toEqual([]);
		expect(fs.existsSync(filePath)).toBe(true);
	});

	it("an empty attachments cell on update keeps the set (OD-2)", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const { id, fileKey } = await seedCaEventWithFile(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "description", "spatialFootprint", "attachments"],
			rows: [[id, "new description", "", ""]],
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		expect((await eventRow(id)).description).toBe("new description");
		expect((await attachmentRowsOf(id)).map((row) => row.fileKey)).toEqual([
			fileKey,
		]);
	});

	it("never reports the 6d-1 skipped-data notice", async () => {
		const { tenantId, userId, tax } = await setupTenant();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(ATTACHMENT_HEADER, [
				createRecord(tax, {
					attachments: cell([linkItem("https://a.example")]),
				}),
			]),
		});

		expect(result).toMatchObject({ ok: true, created: 1 });
		expect("skippedDataNotice" in result).toBe(false);
		expect(result.ignoredColumns).toEqual([]);
	});
});

// PGlite has one connection, so "both read E before either writes" is emulated: the second
// import is served the snapshot it read before the first committed (6d-1 known limit).
describe("concurrent imports changing one event's footprint or attachments (outcome only)", () => {
	// Only the import's snapshot is stale; Update reads the event fresh, as under READ COMMITTED
	// once the first import has committed. The expected version must still reject it.
	async function staleSecondImport(tenantId: string) {
		const second = buildCsvHarness();
		const staleRows =
			await second.hazardousEventRepository.findExportRows(tenantId);
		return {
			second,
			arm: () => {
				vi.spyOn(
					second.hazardousEventRepository,
					"findExportRows",
				).mockResolvedValueOnce(staleRows);
			},
		};
	}

	it("Scenario: Two imports race on one event's attachments -- one commits, the other fails with concurrent_modification, K deleted once", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const { id, fileKey, filePath } = await seedCaEventWithFile(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		const { second, arm } = await staleSecondImport(tenantId);
		try {
			const first = await runImport(harness, {
				tenantId,
				actingUserId: userId,
				mode: "update",
				header: ["id", "attachments"],
				rows: [[id, "[]"]],
			});
			arm();
			const retitled = await runImport(second, {
				tenantId,
				actingUserId: userId,
				mode: "update",
				header: ["id", "attachments"],
				rows: [
					[
						id,
						JSON.stringify([
							{
								title: "Retitled",
								file_option: "File",
								file: { name: fileKey },
							},
						]),
					],
				],
			});

			expect(first).toMatchObject({ ok: true, updated: 1 });
			expect(retitled).toMatchObject({
				ok: false,
				rowErrors: [{ line: 2, code: "concurrent_modification" }],
			});
			expect(await attachmentRowsOf(id)).toHaveLength(0);
			const deletes = [
				...harness.storageEvents,
				...second.storageEvents,
			].filter((event) => event.op === "delete");
			expect(deletes).toEqual([{ op: "delete", ownerId: id, fileKey }]);
			expect(fs.existsSync(filePath)).toBe(false);
		} finally {
			second.cleanup();
		}
	});

	it("Scenario: Two imports race on one event's footprint -- at most one new observation commits", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		const { second, arm } = await staleSecondImport(tenantId);
		const footprint = (x: number) =>
			JSON.stringify([
				{
					map_option: "Map coordinates",
					geojson: { type: "Point", coordinates: [x, 1] },
				},
			]);
		try {
			const first = await runImport(harness, {
				tenantId,
				actingUserId: userId,
				mode: "update",
				header: ["id", "spatialFootprint"],
				rows: [[id, footprint(1)]],
			});
			arm();
			const loser = await runImport(second, {
				tenantId,
				actingUserId: userId,
				mode: "update",
				header: ["id", "spatialFootprint"],
				rows: [[id, footprint(2)]],
			});

			expect(first).toMatchObject({ ok: true, updated: 1 });
			expect(loser).toMatchObject({ ok: false });
			expect(
				loser.ok ? [] : loser.rowErrors.map((error) => error.code),
			).toEqual([
				expect.stringMatching(/^(concurrent_modification|conflict)$/),
			]);
			expect(await observationCount(id)).toBe(1);
		} finally {
			second.cleanup();
		}
	});
});

describe("create, update and upsert modes", () => {
	it("update leaves columns absent from the header unchanged", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { description: "d1", magnitude: "m1" },
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "description"],
			rows: [[id, "d2"]],
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		const row = await eventRow(id);
		expect(row.description).toBe("d2");
		expect(row.magnitude).toBe("m1");
	});

	it("upsert updates a matching apiImportId and creates a missing one", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const existing = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { apiImportId: "A1", description: "old" },
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "upsert",
			...csvTable(CREATE_HEADER, [
				createRecord(tax, { apiImportId: "A1", description: "changed" }),
				createRecord(tax, { apiImportId: "A2", description: "new" }),
			]),
		});

		expect(result).toMatchObject({ ok: true, updated: 1, created: 1 });
		expect((await eventRow(existing)).description).toBe("changed");
		const events = await eventsOfTenant(tenantId);
		expect(events).toHaveLength(2);
		expect(events.map((row) => row.apiImportId).sort()).toEqual(["A1", "A2"]);
	});

	it("an invalid mode gives invalid_mode and writes nothing", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const before = await globalCounts();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "bogus",
			...csvTable(CREATE_HEADER, [createRecord(tax)]),
		});

		expect(result).toMatchObject({
			ok: false,
			fileErrors: [expect.objectContaining({ code: "invalid_mode" })],
		});
		expect(await globalCounts()).toEqual(before);
	});
});

describe("an import is all or nothing", () => {
	it("a failing parent on line 3 rolls back the valid lines 2 and 4", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const before = await globalCounts();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(
				[...CREATE_HEADER, "parent"],
				[
					createRecord(tax),
					createRecord(tax, { parent: randomUUID() }),
					createRecord(tax),
				],
			),
		});

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.rowErrors).toEqual([
			expect.objectContaining({ line: 3, code: "not_found" }),
		]);
		expect(await globalCounts()).toEqual(before);
	});

	it("a create row whose apiImportId already exists in the tenant gives conflict on apiImportId", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { apiImportId: "A1" },
		});
		const before = await globalCounts();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(CREATE_HEADER, [createRecord(tax, { apiImportId: "A1" })]),
		});

		expect(result.ok === false && result.rowErrors).toContainEqual(
			expect.objectContaining({
				line: 2,
				column: "apiImportId",
				code: "conflict",
			}),
		);
		expect(await globalCounts()).toEqual(before);
	});

	it("a non-DomainError on the second row propagates from execute and nothing is written", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const repository = harness.hazardousEventRepository;
		const original = repository.insert.bind(repository);
		vi.spyOn(repository, "insert")
			.mockImplementationOnce(original)
			.mockRejectedValueOnce(new Error("boom-second-row"));
		const before = await globalCounts();

		await expect(
			runImport(harness, {
				tenantId,
				actingUserId: userId,
				mode: "create",
				...csvTable(CREATE_HEADER, [createRecord(tax), createRecord(tax)]),
			}),
		).rejects.toThrow("boom-second-row");

		expect(await globalCounts()).toEqual(before);
	});
});

describe("update and upsert obey the status-aware edit rule", () => {
	it("changing a SUBMITTED event's description gives not_editable and nothing is written", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			workflow: "SUBMITTED",
		});
		const before = await tenantSnapshot(tenantId);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "description"],
			rows: [[id, "changed"]],
		});

		expect(result.ok === false && result.rowErrors).toContainEqual(
			expect.objectContaining({ line: 2, code: "not_editable" }),
		);
		expect(await tenantSnapshot(tenantId)).toEqual(before);
	});

	it("changing an event with a null specific_hazard_id gives not_migrated and nothing is written", async () => {
		const { tenantId, userId } = await setupTenant();
		const id = await seedLegacyEvent({ tenantId });
		const before = await tenantSnapshot(tenantId);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "description"],
			rows: [[id, "changed"]],
		});

		expect(result.ok === false && result.rowErrors).toContainEqual(
			expect.objectContaining({ line: 2, code: "not_migrated" }),
		);
		expect(await tenantSnapshot(tenantId)).toEqual(before);
	});
});

describe("the import logs one outcome line after commit", () => {
	it("a successful import logs exactly one hazardous_events.csv_imported line with counts and no cell values", async () => {
		const logger = new RecordingLogger();
		harness.cleanup();
		harness = buildCsvHarness(logger);
		const { tenantId, userId, tax } = await setupTenant();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(CREATE_HEADER, [
				createRecord(tax, { description: "secret-cell-value" }),
				createRecord(tax),
			]),
		});

		expect(result).toMatchObject({ ok: true, created: 2 });
		const imported = logger.infoCalls.filter(
			(call) => call.msg === "hazardous_events.csv_imported",
		);
		expect(imported).toEqual([
			{
				msg: "hazardous_events.csv_imported",
				tenantId,
				mode: "create",
				created: 2,
				updated: 0,
				unchanged: 0,
			},
		]);
		// Create keeps its own per-event info line inside the caller tx (user decision).
		expect(
			logger.messages().filter((m) => m === "hazardous_event.created"),
		).toHaveLength(2);
		expect(logger.messages()).not.toContain("hazardous_event.updated");
		expect(JSON.stringify(logger.infoCalls)).not.toContain("secret-cell-value");
	});

	it("an import that fails on its third row logs no success line", async () => {
		const logger = new RecordingLogger();
		harness.cleanup();
		harness = buildCsvHarness(logger);
		const { tenantId, userId, tax } = await setupTenant();

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(
				[...CREATE_HEADER, "parent"],
				[
					createRecord(tax),
					createRecord(tax),
					createRecord(tax, { parent: randomUUID() }),
				],
			),
		});

		expect(result.ok).toBe(false);
		expect(logger.messages()).not.toContain("hazardous_events.csv_imported");
		// Per-event lines precede the rollback; only csv_imported marks a committed file.
		expect(
			logger.messages().filter((m) => m === "hazardous_event.created"),
		).toHaveLength(2);
		expect(
			logger
				.messages()
				.filter((m) => m === "hazardous_events.csv_import_rejected"),
		).toHaveLength(1);
	});
});

describe("concurrent imports never create a duplicate (outcome only)", () => {
	it("two upserts of the same new apiImportId leave exactly one event for it", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const file = csvTable(CREATE_HEADER, [
			createRecord(tax, { apiImportId: "RACE-1" }),
		]);

		const first = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "upsert",
			...file,
		});
		const second = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "upsert",
			...file,
		});

		expect(first).toMatchObject({ ok: true, created: 1 });
		expect(second).toMatchObject({ ok: true, created: 0, unchanged: 1 });
		const matching = (await eventsOfTenant(tenantId)).filter(
			(row) => row.apiImportId === "RACE-1",
		);
		expect(matching).toHaveLength(1);
	});
});
