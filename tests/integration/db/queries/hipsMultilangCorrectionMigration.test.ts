import { readFileSync } from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";

const MIGRATION_PATH = path.resolve(
	__dirname,
	"../../../../app/drizzle/migrations/20261011000000_fix_hips_multilang_corrections.sql",
);

// Post-c42affd1 shape: hip_version_id typo, no cascade, nine nullable columns. A raw
// PGlite client, not the shared `dr` (built from the already-corrected TS schema and so
// unable to represent this pre-migration state).
const PRE_CORRECTION_DDL = `
CREATE TABLE public.language (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	language_cd varchar(2) NOT NULL UNIQUE,
	language_name text NOT NULL UNIQUE
);
CREATE TABLE public.text_content (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	original_text text NOT NULL,
	original_language_id uuid REFERENCES public.language(id)
);
CREATE TABLE public.translation (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	text_content_id uuid REFERENCES public.text_content(id),
	language_id uuid REFERENCES public.language(id),
	translation text NOT NULL
);
CREATE UNIQUE INDEX translation_text_language_uq ON public.translation (text_content_id, language_id);
CREATE TABLE public.hips_version (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	version_no text NOT NULL UNIQUE
);
CREATE TABLE public.hazard_type (
	id uuid PRIMARY KEY,
	name_text_content_id uuid REFERENCES public.text_content(id),
	hip_version_id uuid REFERENCES public.hips_version(id),
	source_ref_id text UNIQUE
);
CREATE TABLE public.hazard_cluster (
	id uuid PRIMARY KEY,
	name_text_content_id uuid REFERENCES public.text_content(id),
	hazard_type_id uuid REFERENCES public.hazard_type(id),
	source_ref_id text UNIQUE
);
CREATE TABLE public.specific_hazard (
	id uuid PRIMARY KEY,
	name_text_content_id uuid REFERENCES public.text_content(id),
	code text NOT NULL,
	hazard_cluster_id uuid REFERENCES public.hazard_cluster(id),
	source_ref_id text UNIQUE,
	description_text_content_id uuid REFERENCES public.text_content(id)
);
`;

type NullProbe = {
	label: string;
	column: string;
	beforeSql: string;
	afterSql: string;
};

type ProbeResult =
	| { ok: true }
	| { ok: false; code: string; column: string | undefined };

describe("hips multilang correction migration (20261011000000)", () => {
	let client: PGlite;
	let enLanguageId: string;
	let frLanguageId: string;
	let hipsVersionId: string;
	let hazardTypeId: string;
	let hazardClusterId: string;
	let typeNameTextContentId: string;
	let clusterNameTextContentId: string;
	let crossLangTextContentId: string;
	let probeRefTextContentId: string;
	let probes: NullProbe[];

	// Each probe runs in its own BEGIN/ROLLBACK: a NULL accepted pre-migration must not
	// leave a row behind, or the migration's own SET NOT NULL step would fail on it.
	async function probeNull(
		sql: string,
		params: unknown[],
	): Promise<ProbeResult> {
		await client.query("BEGIN");
		try {
			await client.query(sql, params);
			await client.query("ROLLBACK");
			return { ok: true };
		} catch (err) {
			await client.query("ROLLBACK").catch(() => {});
			const e = err as { code?: string; column?: string };
			return { ok: false, code: e.code ?? "", column: e.column };
		}
	}

	beforeAll(async () => {
		client = new PGlite();
		await client.exec(PRE_CORRECTION_DDL);

		const { rows: langRows } = await client.query<{ id: string }>(
			`INSERT INTO public.language (language_cd, language_name) VALUES ('en', 'English') RETURNING id`,
		);
		enLanguageId = langRows[0].id;

		const { rows: frLangRows } = await client.query<{ id: string }>(
			`INSERT INTO public.language (language_cd, language_name) VALUES ('fr', 'French') RETURNING id`,
		);
		frLanguageId = frLangRows[0].id;

		const { rows: versionRows } = await client.query<{ id: string }>(
			`INSERT INTO public.hips_version (version_no) VALUES ('2025') RETURNING id`,
		);
		hipsVersionId = versionRows[0].id;

		// No same-language translation row yet — the backfill's happy-path target.
		const { rows: typeTextRows } = await client.query<{ id: string }>(
			`INSERT INTO public.text_content (original_text, original_language_id) VALUES ('Geohazards', $1) RETURNING id`,
			[enLanguageId],
		);
		typeNameTextContentId = typeTextRows[0].id;

		// Already has a same-language translation row — proves the backfill won't duplicate it.
		const { rows: clusterTextRows } = await client.query<{ id: string }>(
			`INSERT INTO public.text_content (original_text, original_language_id) VALUES ('Seismogenic', $1) RETURNING id`,
			[enLanguageId],
		);
		clusterNameTextContentId = clusterTextRows[0].id;
		await client.query(
			`INSERT INTO public.translation (text_content_id, language_id, translation) VALUES ($1, $2, 'Seismogenic')`,
			[clusterNameTextContentId, enLanguageId],
		);

		// original_language_id = en but its only existing translation is fr — proves the
		// backfill's NOT EXISTS predicate is language-specific, not "any translation exists".
		const { rows: crossLangTextRows } = await client.query<{ id: string }>(
			`INSERT INTO public.text_content (original_text, original_language_id) VALUES ('Hydrometeorological', $1) RETURNING id`,
			[enLanguageId],
		);
		crossLangTextContentId = crossLangTextRows[0].id;
		await client.query(
			`INSERT INTO public.translation (text_content_id, language_id, translation) VALUES ($1, $2, 'Hydrométéorologique')`,
			[crossLangTextContentId, frLanguageId],
		);

		const { rows: probeTextRows } = await client.query<{ id: string }>(
			`INSERT INTO public.text_content (original_text, original_language_id) VALUES ('Probe', $1) RETURNING id`,
			[enLanguageId],
		);
		probeRefTextContentId = probeTextRows[0].id;

		const { rows: typeRows } = await client.query<{ id: string }>(
			`INSERT INTO public.hazard_type (id, name_text_content_id, hip_version_id, source_ref_id) VALUES (gen_random_uuid(), $1, $2, 'GH') RETURNING id`,
			[typeNameTextContentId, hipsVersionId],
		);
		hazardTypeId = typeRows[0].id;

		const { rows: clusterRows } = await client.query<{ id: string }>(
			`INSERT INTO public.hazard_cluster (id, name_text_content_id, hazard_type_id, source_ref_id) VALUES (gen_random_uuid(), $1, $2, 'SEIS') RETURNING id`,
			[clusterNameTextContentId, hazardTypeId],
		);
		hazardClusterId = clusterRows[0].id;

		await client.query(
			`INSERT INTO public.specific_hazard (id, name_text_content_id, code, hazard_cluster_id, source_ref_id) VALUES (gen_random_uuid(), $1, 'EQ001', $2, 'EQ')`,
			[typeNameTextContentId, hazardClusterId],
		);

		probes = [
			{
				label: "hazard_type.name_text_content_id",
				column: "name_text_content_id",
				beforeSql: `INSERT INTO public.hazard_type (id, name_text_content_id, hip_version_id) VALUES (gen_random_uuid(), NULL, $1)`,
				afterSql: `INSERT INTO public.hazard_type (id, name_text_content_id, hips_version_id) VALUES (gen_random_uuid(), NULL, $1)`,
			},
			{
				label: "hazard_cluster.name_text_content_id",
				column: "name_text_content_id",
				beforeSql: `INSERT INTO public.hazard_cluster (id, name_text_content_id, hazard_type_id) VALUES (gen_random_uuid(), NULL, $1)`,
				afterSql: `INSERT INTO public.hazard_cluster (id, name_text_content_id, hazard_type_id) VALUES (gen_random_uuid(), NULL, $1)`,
			},
			{
				label: "specific_hazard.name_text_content_id",
				column: "name_text_content_id",
				beforeSql: `INSERT INTO public.specific_hazard (id, name_text_content_id, code, hazard_cluster_id) VALUES (gen_random_uuid(), NULL, 'PROBE', $1)`,
				afterSql: `INSERT INTO public.specific_hazard (id, name_text_content_id, code, hazard_cluster_id) VALUES (gen_random_uuid(), NULL, 'PROBE', $1)`,
			},
			{
				label: "hazard_type.hips_version_id (renamed)",
				column: "hips_version_id",
				beforeSql: `INSERT INTO public.hazard_type (id, name_text_content_id, hip_version_id) VALUES (gen_random_uuid(), $1, NULL)`,
				afterSql: `INSERT INTO public.hazard_type (id, name_text_content_id, hips_version_id) VALUES (gen_random_uuid(), $1, NULL)`,
			},
			{
				label: "hazard_cluster.hazard_type_id",
				column: "hazard_type_id",
				beforeSql: `INSERT INTO public.hazard_cluster (id, name_text_content_id, hazard_type_id) VALUES (gen_random_uuid(), $1, NULL)`,
				afterSql: `INSERT INTO public.hazard_cluster (id, name_text_content_id, hazard_type_id) VALUES (gen_random_uuid(), $1, NULL)`,
			},
			{
				label: "specific_hazard.hazard_cluster_id",
				column: "hazard_cluster_id",
				beforeSql: `INSERT INTO public.specific_hazard (id, name_text_content_id, code, hazard_cluster_id) VALUES (gen_random_uuid(), $1, 'PROBE', NULL)`,
				afterSql: `INSERT INTO public.specific_hazard (id, name_text_content_id, code, hazard_cluster_id) VALUES (gen_random_uuid(), $1, 'PROBE', NULL)`,
			},
			{
				label: "text_content.original_language_id",
				column: "original_language_id",
				beforeSql: `INSERT INTO public.text_content (original_text, original_language_id) VALUES ('Probe', NULL)`,
				afterSql: `INSERT INTO public.text_content (original_text, original_language_id) VALUES ('Probe', NULL)`,
			},
			{
				label: "translation.text_content_id",
				column: "text_content_id",
				beforeSql: `INSERT INTO public.translation (text_content_id, language_id, translation) VALUES (NULL, $1, 'Probe')`,
				afterSql: `INSERT INTO public.translation (text_content_id, language_id, translation) VALUES (NULL, $1, 'Probe')`,
			},
			{
				label: "translation.language_id",
				column: "language_id",
				beforeSql: `INSERT INTO public.translation (text_content_id, language_id, translation) VALUES ($1, NULL, 'Probe')`,
				afterSql: `INSERT INTO public.translation (text_content_id, language_id, translation) VALUES ($1, NULL, 'Probe')`,
			},
		];
	}, 30000);

	afterAll(async () => {
		await client.close();
	});

	function probeParams(label: string): unknown[] {
		switch (label) {
			case "hazard_type.name_text_content_id":
				return [hipsVersionId];
			case "hazard_cluster.name_text_content_id":
				return [hazardTypeId];
			case "specific_hazard.name_text_content_id":
				return [hazardClusterId];
			case "hazard_type.hips_version_id (renamed)":
				return [probeRefTextContentId];
			case "hazard_cluster.hazard_type_id":
				return [probeRefTextContentId];
			case "specific_hazard.hazard_cluster_id":
				return [probeRefTextContentId];
			case "translation.text_content_id":
				return [enLanguageId];
			case "translation.language_id":
				return [probeRefTextContentId];
			default:
				return [];
		}
	}

	describe("before the correction migration runs", () => {
		it("accepts a NULL in each of the nine not-yet-constrained columns", async () => {
			for (const probe of probes) {
				const result = await probeNull(
					probe.beforeSql,
					probeParams(probe.label),
				);
				expect.soft(result.ok, probe.label).toBe(true);
			}
		});

		it("has no ON DELETE CASCADE on translation's FK to text_content", async () => {
			const { rows } = await client.query<{ confdeltype: string }>(
				`SELECT confdeltype FROM pg_constraint
				 WHERE conrelid = 'public.translation'::regclass
				   AND confrelid = 'public.text_content'::regclass
				   AND contype = 'f'`,
			);
			expect(rows[0].confdeltype).toBe("a");
		});

		it("fails to select hazard_type through the real TS schema (column is still hip_version_id)", async () => {
			const db = drizzle(client);
			await expect(db.select().from(hazardTypeTable)).rejects.toThrow();
		});

		it("has no same-language translation row for the text_content row the adopted migration left unbackfilled", async () => {
			const { rows } = await client.query(
				`SELECT 1 FROM public.translation WHERE text_content_id = $1 AND language_id = $2`,
				[typeNameTextContentId, enLanguageId],
			);
			expect(rows).toHaveLength(0);
		});
	});

	describe("running the correction migration", () => {
		beforeAll(async () => {
			const sql = readFileSync(MIGRATION_PATH, "utf-8");
			const statements = sql
				.split("--> statement-breakpoint")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			for (const statement of statements) {
				await client.query(statement);
			}
		});

		it("renames hazard_type.hip_version_id to hips_version_id", async () => {
			const { rows } = await client.query<{ column_name: string }>(
				`SELECT column_name FROM information_schema.columns
				 WHERE table_name = 'hazard_type' AND column_name IN ('hip_version_id', 'hips_version_id')`,
			);
			expect(rows.map((r) => r.column_name)).toEqual(["hips_version_id"]);
		});

		it("renames the FK constraint to hazard_type_hips_version_id_fk", async () => {
			const { rows } = await client.query<{ conname: string }>(
				`SELECT conname FROM pg_constraint
				 WHERE conrelid = 'public.hazard_type'::regclass
				   AND confrelid = 'public.hips_version'::regclass
				   AND contype = 'f'`,
			);
			expect(rows.map((r) => r.conname)).toEqual([
				"hazard_type_hips_version_id_fk",
			]);
		});

		it("resolves hazard_type through the real TS schema after the rename", async () => {
			const db = drizzle(client);
			const rows = await db.select().from(hazardTypeTable);
			const row = rows.find((r) => r.id === hazardTypeId);
			expect(row?.hipsVersionId).toBe(hipsVersionId);
		});

		it("adds ON DELETE CASCADE to translation's FK to text_content", async () => {
			const { rows } = await client.query<{ confdeltype: string }>(
				`SELECT confdeltype FROM pg_constraint
				 WHERE conrelid = 'public.translation'::regclass
				   AND confrelid = 'public.text_content'::regclass
				   AND contype = 'f'`,
			);
			expect(rows[0].confdeltype).toBe("c");
		});

		it("rejects a NULL in each of the nine corrected columns with 23502 on the right column", async () => {
			for (const probe of probes) {
				const result = await probeNull(
					probe.afterSql,
					probeParams(probe.label),
				);
				expect.soft(result, probe.label).toEqual({
					ok: false,
					code: "23502",
					column: probe.column,
				});
			}
		});

		it("backfills the missing same-language translation row", async () => {
			const { rows } = await client.query<{ translation: string }>(
				`SELECT translation FROM public.translation WHERE text_content_id = $1 AND language_id = $2`,
				[typeNameTextContentId, enLanguageId],
			);
			expect(rows).toHaveLength(1);
			expect(rows[0].translation).toBe("Geohazards");
		});

		it("does not duplicate a same-language translation row that already existed", async () => {
			const { rows } = await client.query(
				`SELECT 1 FROM public.translation WHERE text_content_id = $1 AND language_id = $2`,
				[clusterNameTextContentId, enLanguageId],
			);
			expect(rows).toHaveLength(1);
		});

		it("still backfills the en translation when a different-language (fr) translation already exists", async () => {
			const { rows } = await client.query<{
				language_id: string;
				translation: string;
			}>(
				`SELECT language_id, translation FROM public.translation WHERE text_content_id = $1`,
				[crossLangTextContentId],
			);
			expect(rows).toHaveLength(2);
			const byLanguage = new Map(
				rows.map((r) => [r.language_id, r.translation]),
			);
			expect(byLanguage.get(enLanguageId)).toBe("Hydrometeorological");
			expect(byLanguage.get(frLanguageId)).toBe("Hydrométéorologique");
		});
	});
});

describe("atomicity: a failure partway through leaves no partial rename/NOT NULL applied", () => {
	// The two migrations this one runs after have zero statement-breakpoints and embed
	// their own literal BEGIN/COMMIT, which closes drizzle's outer migration transaction
	// early (verified against this project's real local Postgres instance). Every later
	// statement in a combined `yarn dbsync` run then auto-commits individually unless this
	// migration opens its own transaction — this test proves it does, by replicating
	// drizzle's own run-statements-then-rollback-on-error algorithm (session.js: BEGIN,
	// execute each statement, COMMIT, or ROLLBACK and rethrow on any error) against a
	// fixture seeded so a later statement fails after earlier ones (including the rename)
	// have already run.
	let client: PGlite;

	beforeAll(async () => {
		client = new PGlite();
		await client.exec(PRE_CORRECTION_DDL);

		const { rows: langRows } = await client.query<{ id: string }>(
			`INSERT INTO public.language (language_cd, language_name) VALUES ('en', 'English') RETURNING id`,
		);
		const enId = langRows[0].id;
		const { rows: versionRows } = await client.query<{ id: string }>(
			`INSERT INTO public.hips_version (version_no) VALUES ('2025') RETURNING id`,
		);
		const versionId = versionRows[0].id;
		const { rows: textRows } = await client.query<{ id: string }>(
			`INSERT INTO public.text_content (original_text, original_language_id) VALUES ('Geohazards', $1) RETURNING id`,
			[enId],
		);
		const { rows: typeRows } = await client.query<{ id: string }>(
			`INSERT INTO public.hazard_type (id, name_text_content_id, hip_version_id) VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
			[textRows[0].id, versionId],
		);
		// NULL here makes the migration's hazard_cluster NOT NULL statement fail — after
		// the rename and the hazard_type NOT NULL statement have already run.
		await client.query(
			`INSERT INTO public.hazard_cluster (id, name_text_content_id, hazard_type_id) VALUES (gen_random_uuid(), NULL, $1)`,
			[typeRows[0].id],
		);

		const sql = readFileSync(MIGRATION_PATH, "utf-8");
		const statements = sql
			.split("--> statement-breakpoint")
			.map((s) => s.trim())
			.filter((s) => s.length > 0);

		let caught: unknown;
		try {
			for (const statement of statements) {
				await client.query(statement);
			}
		} catch (err) {
			caught = err;
			await client.query("ROLLBACK").catch(() => {});
		}
		expect(caught).toBeDefined();
	}, 30000);

	afterAll(async () => {
		await client.close();
	});

	it("rolls back the column rename along with the failed statement", async () => {
		const { rows } = await client.query<{ column_name: string }>(
			`SELECT column_name FROM information_schema.columns
			 WHERE table_name = 'hazard_type' AND column_name IN ('hip_version_id', 'hips_version_id')`,
		);
		expect(rows.map((r) => r.column_name)).toEqual(["hip_version_id"]);
	});

	it("rolls back the hazard_type NOT NULL that already ran before the failure", async () => {
		const { rows } = await client.query<{ attnotnull: boolean }>(
			`SELECT attnotnull FROM pg_attribute
			 WHERE attrelid = 'public.hazard_type'::regclass AND attname = 'name_text_content_id'`,
		);
		expect(rows[0].attnotnull).toBe(false);
	});
});
