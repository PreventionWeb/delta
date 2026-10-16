import { readFileSync } from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationDir = path.resolve(
	__dirname,
	"../../../../app/drizzle/migrations",
);

const migrationFiles = [
	"20261009042834_migrate_hips_with_multi_language_support_and_fixed_hipsUUID.sql",
	"20261009091033_alter_language_table.sql",
	"20261011000000_fix_hips_multilang_corrections.sql",
	"20261012000000_widen_language_cd_bcp47.sql",
	"20261015095931_migrate_hazardous_event_hip_hazard_id_to_hazardous_event_specific_hazard_id.sql",
	"20261015100018_migrate_hazardous_event_spatial.sql",
	"20261015100055_migrate_hazardous_event_causality_from_event_relationship_to_hazardous_event_causality.sql",
	"20261015100122_migrate_validation_workflow.sql",
] as const;

async function createIsolatedPglite() {
	const db = new PGlite();
	await db.exec(`
		CREATE TABLE public.language (
			id uuid PRIMARY KEY,
			language_cd varchar(2) NOT NULL UNIQUE,
			language_name text NOT NULL UNIQUE
		);
		CREATE TABLE public.text_content (
			id uuid PRIMARY KEY,
			original_text text NOT NULL,
			original_language_id uuid
		);
		CREATE TABLE public.translation (
			id uuid PRIMARY KEY,
			text_content_id uuid NOT NULL,
			language_id uuid NOT NULL,
			translation text NOT NULL
		);
		CREATE TABLE public.hips_version (
			id uuid PRIMARY KEY,
			version_no text NOT NULL UNIQUE
		);
		CREATE TABLE public.hazard_type (
			id uuid PRIMARY KEY,
			name_text_content_id uuid,
			hip_version_id uuid,
			source_ref_id text UNIQUE
		);
		CREATE TABLE public.hazard_cluster (
			id uuid PRIMARY KEY,
			name_text_content_id uuid,
			hazard_type_id uuid,
			source_ref_id text UNIQUE
		);
		CREATE TABLE public.specific_hazard (
			id uuid PRIMARY KEY,
			name_text_content_id uuid,
			code text NOT NULL,
			hazard_cluster_id uuid,
			source_ref_id text UNIQUE,
			description_text_content_id uuid
		);
		CREATE TABLE public.hazardous_event (
			id uuid PRIMARY KEY,
			hip_hazard_id text,
			specific_hazard_id uuid REFERENCES public.specific_hazard(id)
		);
		CREATE TABLE public.event_relationship (
			id uuid PRIMARY KEY,
			parent_id uuid,
			child_id uuid
		);
	`);

	const typeIds: string[] = [];
	const clusterIds: string[] = [];
	const hazardIds: string[] = [];

	for (let i = 0; i < 8; i += 1) {
		const typeId = `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`;
		typeIds.push(typeId);
		await db.exec(
			`INSERT INTO public.hazard_type (id, source_ref_id) VALUES ('${typeId}', 'type-${i + 1}')`,
		);
	}

	for (let i = 0; i < 38; i += 1) {
		const clusterId = `00000000-0000-0000-1000-${String(i + 1).padStart(12, "0")}`;
		clusterIds.push(clusterId);
		await db.exec(
			`INSERT INTO public.hazard_cluster (id, hazard_type_id, source_ref_id) VALUES ('${clusterId}', '${typeIds[i % typeIds.length]}', 'cluster-${i + 1}')`,
		);
	}

	for (let i = 0; i < 281; i += 1) {
		const hazardId = `00000000-0000-0000-2000-${String(i + 1).padStart(12, "0")}`;
		hazardIds.push(hazardId);
		await db.exec(
			`INSERT INTO public.specific_hazard (id, code, hazard_cluster_id, source_ref_id) VALUES ('${hazardId}', 'HZ-${i + 1}', '${clusterIds[i % clusterIds.length]}', 'hazard-${i + 1}')`,
		);
	}

	await db.exec(
		`INSERT INTO public.hazardous_event (id, hip_hazard_id) VALUES ('00000000-0000-0000-3000-000000000001', 'hazard-1');
		 INSERT INTO public.hazardous_event (id, hip_hazard_id) VALUES ('00000000-0000-0000-3000-000000000002', 'hazard-2');`,
	);

	return db;
}

async function validateReferenceCoverage(db: PGlite) {
	const sourceCheck = await db.query<{ count: number }>(`
		SELECT COUNT(*)::int AS count
		FROM public.hazardous_event he
		LEFT JOIN public.specific_hazard sh ON sh.source_ref_id = he.hip_hazard_id
		WHERE he.hip_hazard_id IS NOT NULL AND sh.id IS NULL
	`);

	const typeCount = await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM public.hazard_type`);
	const clusterCount = await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM public.hazard_cluster`);
	const hazardCount = await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM public.specific_hazard`);

	return {
		discrepancies: sourceCheck.rows[0]?.count ?? 0,
		typeCount: typeCount.rows[0]?.count ?? 0,
		clusterCount: clusterCount.rows[0]?.count ?? 0,
		hazardCount: hazardCount.rows[0]?.count ?? 0,
	};
}

describe("migration validator harness", () => {
	it("tracks the expected migration sequence", () => {
		expect(migrationFiles).toEqual([
			"20261009042834_migrate_hips_with_multi_language_support_and_fixed_hipsUUID.sql",
			"20261009091033_alter_language_table.sql",
			"20261011000000_fix_hips_multilang_corrections.sql",
			"20261012000000_widen_language_cd_bcp47.sql",
			"20261015095931_migrate_hazardous_event_hip_hazard_id_to_hazardous_event_specific_hazard_id.sql",
			"20261015100018_migrate_hazardous_event_spatial.sql",
			"20261015100055_migrate_hazardous_event_causality_from_event_relationship_to_hazardous_event_causality.sql",
			"20261015100122_migrate_validation_workflow.sql",
		]);
	});

	it("creates an isolated in-memory PGlite database", async () => {
		const db = new PGlite();
		const { rows } = await db.query<{ ok: number }>("SELECT 1 AS ok");
		expect(rows[0]?.ok).toBe(1);
		await db.close();
	}, 20000);

	it("reads the original migration files and verifies they remain intact", () => {
		for (const fileName of migrationFiles) {
			const filePath = path.join(migrationDir, fileName);
			const sql = readFileSync(filePath, "utf8");
			expect(sql.length).toBeGreaterThan(0);
			const hasSqlMarker =
				sql.includes("BEGIN") ||
				sql.includes("CREATE TABLE") ||
				sql.includes("ALTER TABLE");
			expect(hasSqlMarker).toBe(true);
		}
	});

	it("marks a clean dataset as zero-discrepancy and a corrupted dataset as failed", async () => {
		const cleanDb = await createIsolatedPglite();
		const cleanCounts = await validateReferenceCoverage(cleanDb);
		expect(cleanCounts.discrepancies).toBe(0);
		expect(cleanCounts.typeCount).toBe(8);
		expect(cleanCounts.clusterCount).toBe(38);
		expect(cleanCounts.hazardCount).toBe(281);

		await cleanDb.exec(
			`UPDATE public.hazardous_event SET hip_hazard_id = 'hazard-9999' WHERE id = '00000000-0000-0000-3000-000000000001'`,
		);
		const corruptCounts = await validateReferenceCoverage(cleanDb);
		expect(corruptCounts.discrepancies).toBeGreaterThan(0);
		await cleanDb.close();
	});

	it("does not hide broken legacy mapping coverage behind aggregate counts", async () => {
		const db = await createIsolatedPglite();
		await db.exec(
			`UPDATE public.specific_hazard SET source_ref_id = 'hazard-999' WHERE source_ref_id = 'hazard-1'`,
		);

		const validation = await validateReferenceCoverage(db);
		expect(validation.discrepancies).toBeGreaterThan(0);
		expect(validation.typeCount).toBe(8);
		expect(validation.clusterCount).toBe(38);
		expect(validation.hazardCount).toBe(281);

		await db.close();
	});
});
