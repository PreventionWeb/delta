import { readFileSync } from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { VALID_LANGUAGES } from "~/utils/lang.backend";

const MIGRATIONS_DIR = path.resolve(
	__dirname,
	"../../../../app/drizzle/migrations",
);
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta/_journal.json");
const LANGUAGE_TABLE_CREATED_AT_TAG =
	"20261009042834_migrate_hips_with_multi_language_support_and_fixed_hipsUUID";
// Word-bounded: matches the table, not a same-named column (e.g. `..._settings.language`).
const TOUCHES_LANGUAGE_TABLE = /\bpublic\.language\b/i;

// idx >= language's creation migration, further filtered by content: an unrelated later
// migration must not replay against this test's language-only fixture.
function migrationsTouchingLanguageTable(): string[] {
	const journal: { entries: { idx: number; tag: string }[] } = JSON.parse(
		readFileSync(JOURNAL_PATH, "utf-8"),
	);
	const startIdx = journal.entries.find(
		(entry) => entry.tag === LANGUAGE_TABLE_CREATED_AT_TAG,
	)?.idx;
	if (startIdx === undefined) {
		throw new Error(
			`Could not find "${LANGUAGE_TABLE_CREATED_AT_TAG}" in ${JOURNAL_PATH}`,
		);
	}
	return journal.entries
		.filter((entry) => entry.idx >= startIdx)
		.sort((a, b) => a.idx - b.idx)
		.map((entry) => path.join(MIGRATIONS_DIR, `${entry.tag}.sql`))
		.filter((migrationPath) =>
			TOUCHES_LANGUAGE_TABLE.test(readFileSync(migrationPath, "utf-8")),
		);
}

// Minimal fixture for 20261009042834's exact-count/FK-name guards, trimmed to what it reads
// (see design.md Decision Q1 "Implementation note").
const PRE_042834_DDL = `
CREATE TABLE public.country_accounts (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE public.hips_version (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	version_no text NOT NULL
);
CREATE TABLE public.hazard_type (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL,
	hips_version_id uuid NOT NULL REFERENCES public.hips_version(id)
);
CREATE TABLE public.hazard_cluster (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL,
	hazard_type_id uuid NOT NULL REFERENCES public.hazard_type(id)
);
CREATE TABLE public.specific_hazard (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL,
	code text NOT NULL,
	hazard_cluster_id uuid NOT NULL REFERENCES public.hazard_cluster(id)
);
CREATE TABLE public.hazardous_event (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	specific_hazard_id uuid
		CONSTRAINT hazardous_event_specific_hazard_id_specific_hazard_id_fk
		REFERENCES public.specific_hazard(id)
);
CREATE TABLE public.field_data_type (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	type text NOT NULL UNIQUE
);
CREATE TABLE public.field_unit (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	unit text NOT NULL UNIQUE
);
CREATE TABLE public.hazard_type_field_definition (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	hazard_type_id uuid NOT NULL
		CONSTRAINT hazard_type_field_definition_hazard_type_id_fk
		REFERENCES public.hazard_type(id),
	data_type uuid NOT NULL REFERENCES public.field_data_type(id),
	unit uuid NOT NULL REFERENCES public.field_unit(id)
);
CREATE TABLE public.hazard_type_custom_field_definition (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	country_accounts_id uuid NOT NULL REFERENCES public.country_accounts(id),
	hazard_type_id uuid NOT NULL
		CONSTRAINT hazard_type_custom_field_definition_hazard_type_id_fk
		REFERENCES public.hazard_type(id),
	data_type uuid NOT NULL REFERENCES public.field_data_type(id),
	unit uuid NOT NULL REFERENCES public.field_unit(id)
);

CREATE TABLE public.hip_class (
	id text PRIMARY KEY,
	name_en text DEFAULT '' NOT NULL,
	name jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT name_en_not_empty
		CHECK ((name->>'en') IS NOT NULL AND TRIM(COALESCE((name->>'en'), '')) <> '')
);
CREATE TABLE public.hip_cluster (
	id text PRIMARY KEY,
	type_id text NOT NULL REFERENCES public.hip_class(id),
	name_en text DEFAULT '' NOT NULL,
	name jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT name_en_not_empty
		CHECK ((name->>'en') IS NOT NULL AND TRIM(COALESCE((name->>'en'), '')) <> '')
);
CREATE TABLE public.hip_hazard (
	id text PRIMARY KEY,
	code text DEFAULT '' NOT NULL,
	cluster_id text NOT NULL REFERENCES public.hip_cluster(id),
	name_en text DEFAULT '' NOT NULL,
	description_en text DEFAULT '' NOT NULL,
	name jsonb DEFAULT '{}'::jsonb NOT NULL,
	description jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT name_en_not_empty
		CHECK ((name->>'en') IS NOT NULL AND TRIM(COALESCE((name->>'en'), '')) <> ''),
	CONSTRAINT description_en_not_empty
		CHECK ((description->>'en') IS NOT NULL AND TRIM(COALESCE((description->>'en'), '')) <> '')
);

INSERT INTO public.hip_class (id, name_en, name)
SELECT 'T' || i, 'Type ' || i, jsonb_build_object('en', 'Type ' || i)
FROM generate_series(1, 8) AS i;

INSERT INTO public.hip_cluster (id, type_id, name_en, name)
SELECT 'C' || i, 'T' || (((i - 1) % 8) + 1), 'Cluster ' || i,
       jsonb_build_object('en', 'Cluster ' || i)
FROM generate_series(1, 38) AS i;

INSERT INTO public.hip_hazard (id, code, cluster_id, name_en, description_en, name, description)
SELECT 'H' || i, 'CODE' || i, 'C' || (((i - 1) % 38) + 1), 'Hazard ' || i, 'Desc ' || i,
       jsonb_build_object('en', 'Hazard ' || i), jsonb_build_object('en', 'Desc ' || i)
FROM generate_series(1, 281) AS i;
`;

describe("language registry consistency with VALID_LANGUAGES (Decision Q1, Option C)", () => {
	let client: PGlite;

	beforeAll(async () => {
		client = new PGlite();
		await client.exec(PRE_042834_DDL);
		for (const migrationPath of migrationsTouchingLanguageTable()) {
			await client.exec(readFileSync(migrationPath, "utf-8"));
		}
	}, 60000);

	afterAll(async () => {
		await client.close();
	});

	it("the migration-produced language_cd set equals VALID_LANGUAGES exactly, in both directions", async () => {
		const { rows } = await client.query<{ language_cd: string }>(
			`SELECT language_cd FROM public.language`,
		);
		const dbCodes = new Set(rows.map((r) => r.language_cd));
		const expected = new Set(VALID_LANGUAGES);

		const missing = [...expected].filter((code) => !dbCodes.has(code));
		const extra = [...dbCodes].filter((code) => !expected.has(code));

		expect({ missing, extra }).toEqual({ missing: [], extra: [] });
	});
});
