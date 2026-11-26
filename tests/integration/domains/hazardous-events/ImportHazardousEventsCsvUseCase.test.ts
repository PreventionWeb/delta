import "../../db/setup";
import { randomUUID } from "crypto";
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
import { hazardousEventAttachmentTable } from "~/domains/hazardous-events/infrastructure/hazardousEventAttachmentTable";
import { hazardousEventSpatialObservationTable } from "~/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationTable";
import { seedCountryAccount } from "../../db/models/hazardousEventTestHelpers";
import {
	E1_HEADER,
	X1_CREATE_HEADER,
	RecordingLogger,
	buildCsvHarness,
	causalityForEffect,
	csvTable,
	eventsOfTenant,
	exportAndReparse,
	globalCounts,
	notificationsFor,
	nullTenantEventCount,
	runImport,
	seedCaEvent,
	seedCausalLink,
	seedLegacyEvent,
	seedTaxonomyWithRefs,
	seedUser,
	tenantSnapshot,
	workflowFor,
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

describe("spatialFootprint and attachments are accepted and ignored", () => {
	it("legacy footprint and attachment cells, even malformed JSON, are ignored, listed, and counted in the notice", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const header = [...CREATE_HEADER, "spatialFootprint", "attachments"];

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(header, [
				createRecord(tax, {
					spatialFootprint: '[{"id":"1","title":"t","geojson":{}}]',
					attachments: '[{"id":"a","title":"doc","file_option":"Link"}]',
				}),
				createRecord(tax, { spatialFootprint: "{not json" }),
				createRecord(tax),
			]),
		});

		expect(result).toMatchObject({
			ok: true,
			created: 3,
			skippedDataNotice: { rows: 2 },
		});
		expect(result.ignoredColumns).toEqual(
			expect.arrayContaining(["spatialFootprint", "attachments"]),
		);
		for (const event of await eventsOfTenant(tenantId)) {
			const attachments = await dr
				.select()
				.from(hazardousEventAttachmentTable)
				.where(eq(hazardousEventAttachmentTable.hazardousEventId, event.id));
			const observations = await dr
				.select()
				.from(hazardousEventSpatialObservationTable)
				.where(
					eq(hazardousEventSpatialObservationTable.hazardousEventId, event.id),
				);
			expect(attachments).toHaveLength(0);
			expect(observations).toHaveLength(0);
		}
	});

	async function seedEventWithLinkAttachment(tenantId: string, tax: Taxonomy) {
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		await dr.insert(hazardousEventAttachmentTable).values({
			hazardousEventId: id,
			title: "Situation report",
			type: "Link",
			url: "https://example.invalid/report",
		});
		return id;
	}

	async function attachmentsOf(id: string) {
		return dr
			.select()
			.from(hazardousEventAttachmentTable)
			.where(eq(hazardousEventAttachmentTable.hazardousEventId, id));
	}

	it("an update with empty footprint and attachment cells changes the description and keeps the attachment's content", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedEventWithLinkAttachment(tenantId, tax);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: ["id", "description", "spatialFootprint", "attachments"],
			rows: [[id, "new description", "[]", "[]"]],
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		expect((await eventRow(id)).description).toBe("new description");
		const after = await attachmentsOf(id);
		expect(after).toHaveLength(1);
		expect(after[0]).toMatchObject({
			title: "Situation report",
			type: "Link",
			url: "https://example.invalid/report",
		});
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
