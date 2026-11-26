import "../../db/setup";
import { randomUUID } from "crypto";
import { Writable } from "node:stream";
import pino from "pino";
import { eq, sql } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { LOG_SERIALIZERS } from "~/infrastructure/logging/PinoLogger.server";
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
import { hazardousEventCausalityTable } from "~/domains/hazardous-events/infrastructure/hazardousEventCausalityTable";
import { ConcurrentModificationError } from "~/shared/errors";
import {
	seedCountryAccount,
	seedHipChain,
} from "../../db/models/hazardousEventTestHelpers";
import {
	RecordingLogger,
	buildCsvHarness,
	causalityForEffect,
	csvTable,
	exportAndReparse,
	runImport,
	seedCaEvent,
	seedLegacyEvent,
	seedLegacyParentLink,
	seedTaxonomyWithRefs,
	seedUser,
	tenantSnapshot,
	type CsvHarness,
} from "./hazardousEventCsvTestHarness";

// Regression scenarios for review findings M1-M7, m2, m3, plus row rules not covered elsewhere.
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

async function setupTenant() {
	const tenantId = await seedCountryAccount();
	const userId = await seedUser();
	const tax = await seedTaxonomyWithRefs();
	return { tenantId, userId, tax };
}

async function seedExplainedCause(causeId: string, effectId: string) {
	await dr.insert(hazardousEventCausalityTable).values({
		causeHazardousEventId: causeId,
		effectHazardousEventId: effectId,
		causalityExplanation: "flood triggered landslide",
	});
}

async function rowOf(id: string) {
	const [row] = await dr
		.select()
		.from(hazardousEventTable)
		.where(eq(hazardousEventTable.id, id));
	return row;
}

describe("M1: an unchanged parent keeps the cause link's explanation", () => {
	it("re-importing an export with only description changed leaves causality_explanation intact", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const causeId = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { startDate: "2024-01-01" },
		});
		const effectId = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		await seedExplainedCause(causeId, effectId);
		const exported = await exportAndReparse(harness, tenantId);
		const descriptionAt = exported.header.indexOf("description");
		const idAt = exported.header.indexOf("id");
		const rows = exported.rows.map((row) =>
			row[idAt] === effectId
				? row.map((cell, i) => (i === descriptionAt ? "changed" : cell))
				: row,
		);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header: exported.header,
			rows,
		});

		expect(result).toMatchObject({ ok: true, updated: 1, unchanged: 1 });
		const [edge] = await causalityForEffect(effectId);
		expect(edge.causeHazardousEventId).toBe(causeId);
		expect(edge.causalityExplanation).toBe("flood triggered landslide");
	});
});

describe("M2: an effect with several causes exports once and re-imports", () => {
	it("findExportRows returns one projection per event even with two cause edges", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const [a, b, effect] = await Promise.all(
			[0, 1, 2].map(() =>
				seedCaEvent(harness, {
					tenantId,
					specificHazardId: tax.specificHazardId,
				}),
			),
		);
		await seedExplainedCause(a, effect);
		await seedExplainedCause(b, effect);

		const rows =
			await harness.hazardousEventRepository.findExportRows(tenantId);
		expect(rows.filter((row) => row.id === effect)).toHaveLength(1);
		expect([a, b].sort()[0]).toBe(
			rows.find((row) => row.id === effect)?.causeId,
		);

		const exported = await exportAndReparse(harness, tenantId);
		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "data-collector",
			mode: "update",
			header: exported.header,
			rows: exported.rows,
		});
		expect(result).toMatchObject({ ok: true, unchanged: 3 });
	});
});

describe("N4: a parent change on a multi-cause effect is rejected", () => {
	async function seedMultiCauseEffect() {
		const { tenantId, userId, tax } = await setupTenant();
		const [a, b, other, effect] = await Promise.all(
			[0, 1, 2, 3].map(() =>
				seedCaEvent(harness, {
					tenantId,
					specificHazardId: tax.specificHazardId,
				}),
			),
		);
		await seedExplainedCause(a, effect);
		await seedExplainedCause(b, effect);
		return { tenantId, userId, a, b, other, effect };
	}

	it("findExportRows counts every cause edge of the effect", async () => {
		const { tenantId, a, effect } = await seedMultiCauseEffect();

		const rows =
			await harness.hazardousEventRepository.findExportRows(tenantId);

		expect(rows.find((row) => row.id === effect)?.causeCount).toBe(2);
		expect(rows.find((row) => row.id === a)?.causeCount).toBe(0);
	});

	it.each([
		["another event", "other"],
		["empty (clear)", "clear"],
	] as const)(
		"parent changed to %s gives parent_multiple_causes and keeps both cause edges",
		async (_label, target) => {
			const { tenantId, userId, a, b, other, effect } =
				await seedMultiCauseEffect();
			const exported = await exportAndReparse(harness, tenantId);
			const parentAt = exported.header.indexOf("parent");
			const idAt = exported.header.indexOf("id");
			const effectIndex = exported.rows.findIndex(
				(row) => row[idAt] === effect,
			);
			const rows = exported.rows.map((row, index) =>
				index === effectIndex
					? row.map((cell, i) =>
							i === parentAt ? (target === "other" ? other : "") : cell,
						)
					: row,
			);
			const before = await tenantSnapshot(tenantId);

			const result = await runImport(harness, {
				tenantId,
				actingUserId: userId,
				mode: "update",
				header: exported.header,
				rows,
			});

			expect(result).toMatchObject({
				ok: false,
				rowErrors: [
					{
						line: 2 + effectIndex,
						code: "parent_multiple_causes",
						column: "parent",
					},
				],
			});
			const edges = await causalityForEffect(effect);
			expect(edges.map((edge) => edge.causeHazardousEventId).sort()).toEqual(
				[a, b].sort(),
			);
			expect(await tenantSnapshot(tenantId)).toEqual(before);
		},
	);
});

describe("M3: the unchanged check compares the resolved hazard", () => {
	it("re-running an upsert file that names the hazard only by specificHazardId is unchanged (published, admin)", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const file = csvTable(
			[
				"apiImportId",
				"specificHazardId",
				"hipHazardId",
				"hipClusterId",
				"hipTypeId",
				"approvalStatus",
				"startDate",
				"endDate",
				"recordOriginator",
			],
			[
				{
					apiImportId: `ONB-${randomUUID()}`,
					specificHazardId: tax.specificHazardId,
					approvalStatus: "published",
					startDate: "2025-01-01",
					endDate: "2025-01-02",
					recordOriginator: "Onboarding",
				},
			],
		);
		const first = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "upsert",
			...file,
		});
		expect(first).toMatchObject({ ok: true, created: 1 });
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
			unchanged: 1,
		});
		expect(await tenantSnapshot(tenantId)).toEqual(before);
	});

	it("a row naming only hipHazardId with empty cluster and type cells is unchanged", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			workflow: "PUBLISHED",
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "data-collector",
			mode: "update",
			...csvTable(
				["id", "hipHazardId", "hipClusterId", "hipTypeId"],
				[{ id, hipHazardId: tax.hipHazardId }],
			),
		});

		expect(result).toMatchObject({ ok: true, unchanged: 1 });
	});

	it("a row naming a different hazard is a change", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const other = await seedTaxonomyWithRefs();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			...csvTable(
				["id", "specificHazardId"],
				[{ id, specificHazardId: other.specificHazardId }],
			),
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		expect((await rowOf(id)).specificHazardId).toBe(other.specificHazardId);
	});
});

describe("M4: text with leading or trailing whitespace round-trips", () => {
	it("an exported description 'foo ' re-imports as unchanged for a published event", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { description: "foo ", recordOriginator: " Field survey" },
			workflow: "PUBLISHED",
		});
		const exported = await exportAndReparse(harness, tenantId);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "data-collector",
			mode: "update",
			header: exported.header,
			rows: exported.rows,
		});

		expect(result).toMatchObject({ ok: true, unchanged: 1 });
	});
});

describe("M5: a cleared CA cause is not brought back by the legacy parent", () => {
	it("a migrated event whose CA cause was cleared exports an empty parent", async () => {
		const { tenantId, tax } = await setupTenant();
		const legacyParent = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		const child = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		await seedLegacyParentLink(legacyParent, child);

		const exported = await exportAndReparse(harness, tenantId);
		const row = exported.rows.find(
			(cells) => cells[exported.header.indexOf("id")] === child,
		);
		expect(row?.[exported.header.indexOf("parent")]).toBe("");
	});

	it("an unmigrated event still exports its legacy parent", async () => {
		const { tenantId } = await setupTenant();
		const parent = await seedLegacyEvent({ tenantId });
		const child = await seedLegacyEvent({ tenantId });
		await seedLegacyParentLink(parent, child);

		const exported = await exportAndReparse(harness, tenantId);
		const row = exported.rows.find(
			(cells) => cells[exported.header.indexOf("id")] === child,
		);
		expect(row?.[exported.header.indexOf("parent")]).toBe(parent);
	});
});

describe("M6: a matched upsert row cannot empty a required cell", () => {
	it("an empty recordOriginator on a matched upsert row is a required error, and nothing is written", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const apiImportId = `M6-${randomUUID()}`;
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { apiImportId },
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "upsert",
			...csvTable(
				["apiImportId", "recordOriginator"],
				[{ apiImportId, recordOriginator: "" }],
			),
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [{ line: 2, code: "required", column: "recordOriginator" }],
		});
		expect((await rowOf(id)).recordOriginator).toBe("Field survey");
	});
});

describe("M7: the edit rule uses the workflow status read inside the transaction", () => {
	it("an event published after the snapshot is not edited by a non-admin", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		const findExportRows = harness.hazardousEventRepository.findExportRows.bind(
			harness.hazardousEventRepository,
		);
		// Publish between the snapshot and the row write, inside the same transaction.
		vi.spyOn(
			harness.hazardousEventRepository,
			"findExportRows",
		).mockImplementation(async (tenant, tx) => {
			const rows = await findExportRows(tenant, tx);
			const instance = await harness.workflowRepository.findByEntity(
				id,
				"HE",
				tx,
			);
			if (instance !== null) {
				const now = new Date();
				await harness.workflowRepository.update(
					instance.directPublish({ userId, now }),
					instance.updatedAt,
					tx,
				);
			}
			return rows;
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "data-collector",
			mode: "update",
			...csvTable(["id", "description"], [{ id, description: "changed" }]),
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [{ line: 2, code: "not_editable" }],
		});
		expect((await rowOf(id)).description).toBe("d1");
	});
});

describe("m2: upper-case UUID cells", () => {
	it("an upper-case id and specificHazardId match their lower-case rows", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			...csvTable(
				["id", "specificHazardId", "description"],
				[
					{
						id: id.toUpperCase(),
						specificHazardId: tax.specificHazardId.toUpperCase(),
						description: "changed",
					},
				],
			),
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
	});
});

describe("m3: an upsert match missing from the snapshot is a conflict", () => {
	it("reports conflict on apiImportId when the id appears after the snapshot", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const apiImportId = `RACE-${randomUUID()}`;
		const realId = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { apiImportId },
		});
		const findExportRows = harness.hazardousEventRepository.findExportRows.bind(
			harness.hazardousEventRepository,
		);
		// Simulates another import committing the row after this snapshot.
		vi.spyOn(
			harness.hazardousEventRepository,
			"findExportRows",
		).mockImplementation(async (tenant, tx) =>
			(await findExportRows(tenant, tx)).filter((row) => row.id !== realId),
		);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "upsert",
			...csvTable(
				["apiImportId", "description"],
				[{ apiImportId, description: "changed" }],
			),
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [{ line: 2, code: "conflict", column: "apiImportId" }],
		});
	});
});

describe("row rules the earlier suites did not cover", () => {
	it("api_import_id_immutable: an update row cannot change a stored apiImportId", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { apiImportId: "OLD-ID" },
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			...csvTable(["id", "apiImportId"], [{ id, apiImportId: "NEW-ID" }]),
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [{ code: "api_import_id_immutable", column: "apiImportId" }],
		});
		expect((await rowOf(id)).apiImportId).toBe("OLD-ID");
	});

	it("a self-referencing parent is a conflict on column parent", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			...csvTable(["id", "parent"], [{ id, parent: id }]),
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [{ code: "conflict", column: "parent" }],
		});
	});

	it("a ConcurrentModificationError from Update becomes concurrent_modification", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		vi.spyOn(harness.hazardousEventRepository, "update").mockRejectedValueOnce(
			new ConcurrentModificationError("modified since read", { id }),
		);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			...csvTable(["id", "description"], [{ id, description: "changed" }]),
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [{ line: 2, code: "concurrent_modification" }],
		});
	});

	it("status_not_permitted on the update path for a non-admin", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "data-collector",
			mode: "update",
			...csvTable(
				["id", "approvalStatus"],
				[{ id, approvalStatus: "published" }],
			),
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [{ code: "status_not_permitted", column: "approvalStatus" }],
		});
		const instance = await harness.workflowRepository.findByEntity(id, "HE");
		expect(instance?.status).toBe("DRAFT");
	});

	it("an event with no WorkflowInstance is editable by import", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			workflow: null,
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			role: "data-collector",
			mode: "update",
			...csvTable(["id", "description"], [{ id, description: "changed" }]),
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		expect((await rowOf(id)).description).toBe("changed");
		expect(await harness.workflowRepository.findByEntity(id, "HE")).toBeNull();
	});
});

describe("gate 8 round 2: a failed hazard edit on a migrated row is never silently unchanged (N1)", () => {
	async function exportedRowFor(tenantId: string, id: string) {
		const exported = await exportAndReparse(harness, tenantId);
		const row = exported.rows.find(
			(cells) => cells[exported.header.indexOf("id")] === id,
		);
		if (row === undefined) throw new Error("exported row missing");
		return { header: exported.header, row };
	}

	it.each([
		["hipHazardId", "99999999", "not_found"],
		["specificHazardId", "not-a-uuid", "invalid_id"],
	])("editing %s to %s reports %s", async (column, value, code) => {
		const { tenantId, userId, tax } = await setupTenant();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		const { header, row } = await exportedRowFor(tenantId, id);
		const edited = row.map((cell, i) => (header[i] === column ? value : cell));

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header,
			rows: [edited],
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [{ code, column }],
		});
	});

	it("editing only hipHazardId to another hazard (specificHazardId left as exported) reports hip_mismatch", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const other = await seedTaxonomyWithRefs();
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});
		const { header, row } = await exportedRowFor(tenantId, id);
		const edited = row.map((cell, i) =>
			header[i] === "hipHazardId" ? other.hipHazardId : cell,
		);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			header,
			rows: [edited],
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [{ code: "hip_mismatch" }],
		});
	});
});

describe("gate 8 round 2: rule order and pass-through (N5, N6)", () => {
	it("a changed unmigrated row reports not_migrated before an unresolvable legacy HIP id", async () => {
		const { tenantId, userId } = await setupTenant();
		// A real legacy chain with no CA taxonomy row pointing at it: unresolvable.
		const hip = await seedHipChain();
		const id = await seedLegacyEvent({ tenantId, hip });

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			...csvTable(
				["id", "hipHazardId", "description"],
				[{ id, hipHazardId: "h-x", description: "changed" }],
			),
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [{ code: "not_migrated" }],
		});
	});

	it("an upper-case parent id links the lower-case event", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const parent = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
			overrides: { startDate: "2024-01-01" },
		});
		const id = await seedCaEvent(harness, {
			tenantId,
			specificHazardId: tax.specificHazardId,
		});

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "update",
			...csvTable(["id", "parent"], [{ id, parent: parent.toUpperCase() }]),
		});

		expect(result).toMatchObject({ ok: true, updated: 1 });
		const [edge] = await causalityForEffect(id);
		expect(edge.causeHazardousEventId).toBe(parent);
	});

	it("row errors use the parser's per-row line numbers", async () => {
		const { tenantId, userId, tax } = await setupTenant();

		const result = await harness.importUseCase.execute({
			tenantId,
			actingUserId: userId,
			role: "admin",
			mode: "create",
			header: ["specificHazardId", "startDate", "endDate", "recordOriginator"],
			rows: [
				[tax.specificHazardId, "2025-01-01", "2025-01-02", "ok"],
				[tax.specificHazardId, "2025-13-45", "2025-01-02", "bad"],
			],
			firstDataLine: 2,
			lineNumbers: [4, 9],
		});

		expect(result).toMatchObject({
			ok: false,
			rowErrors: [{ line: 9, code: "invalid_date", column: "startDate" }],
		});
	});
});

describe("gate 8 round 3: cluster/type cells alone never change a migrated hazard (F1)", () => {
	it("a row supplying only a different hipTypeId is unchanged and writes nothing", async () => {
		const { tenantId, userId, tax } = await setupTenant();
		const other = await seedTaxonomyWithRefs();
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
			...csvTable(
				["id", "hipTypeId", "hipClusterId"],
				[{ id, hipTypeId: other.hipTypeId, hipClusterId: other.hipClusterId }],
			),
		});

		expect(result).toMatchObject({ ok: true, unchanged: 1, updated: 0 });
		expect(await tenantSnapshot(tenantId)).toEqual(before);
	});
});

describe("gate 10: a real query error logs no parameters (m6d)", () => {
	it("logs a repository's DrizzleQueryError without the query parameter", async () => {
		const { tenantId } = await setupTenant();
		const sentinel = "SENTINEL\u0000PARAM";
		const err: unknown = await harness.hazardousEventRepository
			.findIdByApiImportId(sentinel, tenantId)
			.then(
				() => undefined,
				(rejection: unknown) => rejection,
			);
		expect(err).toBeInstanceOf(DrizzleQueryError);

		const chunks: string[] = [];
		const stream = new Writable({
			write(chunk, _encoding, callback) {
				chunks.push(chunk.toString());
				callback();
			},
		});
		pino({ serializers: LOG_SERIALIZERS }, stream).error({
			msg: "lookup failed",
			err,
		});

		const output = chunks.join("");
		expect(output).toContain('"code":"22021"');
		expect(output).not.toContain("SENTINEL");
	});
});

describe("gate 10: the error list is bounded (finding 3)", () => {
	it("returns the first 200 errors in line order and the total count", async () => {
		const { tenantId, userId } = await setupTenant();
		const records = Array.from({ length: 250 }, () => ({
			startDate: "2025-13-45",
			endDate: "2025",
			recordOriginator: "bounded",
			specificHazardId: "",
		}));

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(Object.keys(records[0]), records),
		});

		if (result.ok) throw new Error("expected a rejected import");
		expect(result.fileErrors.length + result.rowErrors.length).toBe(200);
		expect(result.errorCount).toBe(500);
		expect(result.rowErrors[0].line).toBe(2);
	});

	it("truncates an echoed header column name to 100 characters", async () => {
		const { tenantId, userId } = await setupTenant();
		const longColumn = "x".repeat(5_000);

		const result = await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			header: ["startDate", "endDate", "recordOriginator", longColumn],
			rows: [["2025", "2025", "a", "b"]],
		});

		if (result.ok) throw new Error("expected a rejected import");
		expect(result.fileErrors).toEqual([
			{ code: "unknown_column", column: "x".repeat(100) },
		]);
		expect(result.errorCount).toBe(1);
	});

	it("logs the total error count, not the truncated length", async () => {
		const logger = new RecordingLogger();
		harness.cleanup();
		harness = buildCsvHarness(logger);
		const { tenantId, userId } = await setupTenant();
		const records = Array.from({ length: 250 }, () => ({
			startDate: "2025-13-45",
			endDate: "2025",
			recordOriginator: "bounded",
			specificHazardId: "",
		}));

		await runImport(harness, {
			tenantId,
			actingUserId: userId,
			mode: "create",
			...csvTable(Object.keys(records[0]), records),
		});

		expect(
			logger.infoCalls.find(
				(call) => call.msg === "hazardous_events.csv_import_rejected",
			),
		).toMatchObject({ fileErrorCount: 0, rowErrorCount: 500 });
	});
});

describe("gate 10: a NUL character is a row error, not a 500 (finding 2)", () => {
	it.each(["hipHazardId", "description"])(
		"a NUL in %s gives invalid_character and writes nothing",
		async (column) => {
			const { tenantId, userId, tax } = await setupTenant();
			const before = await tenantSnapshot(tenantId);
			const record: Record<string, string> = {
				startDate: "2025",
				endDate: "2025",
				recordOriginator: "nul-test",
				hipHazardId: tax.hipHazardId,
				description: "ok",
				[column]: "bad\u0000value",
			};

			const result = await runImport(harness, {
				tenantId,
				actingUserId: userId,
				mode: "create",
				...csvTable(Object.keys(record), [record]),
			});

			expect(result).toMatchObject({ ok: false });
			expect(result.ok ? [] : result.rowErrors).toContainEqual({
				line: 2,
				code: "invalid_character",
				column,
			});
			expect(await tenantSnapshot(tenantId)).toEqual(before);
		},
	);
});
