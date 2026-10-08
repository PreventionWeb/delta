import { readFileSync } from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, PgliteDatabase } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { languageTable } from "~/domains/shared/infrastructure/languageTable";
import { textContentTable } from "~/domains/shared/infrastructure/textContentTable";
import { translationTable } from "~/domains/shared/infrastructure/translationTable";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";
import { hazardClusterTable } from "~/domains/hazardous-events/infrastructure/hazardClusterTable";
import { specificHazardTable } from "~/domains/hazardous-events/infrastructure/specificHazardTable";

const MIGRATION_PATH = path.resolve(
	__dirname,
	"../../../../app/drizzle/migrations/20261008000000_add_shared_multilang_taxonomy.sql",
);

// Pre-migration DDL (2b's shipped shape); pushSchema-based `dr` can't see this — design.md Decision 9.
const PRE_MIGRATION_DDL = `
CREATE TABLE "hips_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_no" text NOT NULL
);
CREATE TABLE "hazard_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hips_version_id" uuid NOT NULL REFERENCES "hips_version"("id")
);
CREATE TABLE "hazard_cluster" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hazard_type_id" uuid NOT NULL REFERENCES "hazard_type"("id")
);
CREATE TABLE "specific_hazard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"hazard_cluster_id" uuid NOT NULL REFERENCES "hazard_cluster"("id")
);
`;

describe("existing taxonomy names are preserved across the multi-language migration", () => {
	let client: PGlite;
	let dr: PgliteDatabase;
	let hipsVersionId: string;
	let hazardTypeId: string;
	let hazardClusterId: string;
	let specificHazardId: string;
	let duplicateNameHazardId: string;

	beforeAll(async () => {
		client = new PGlite();
		await client.exec(PRE_MIGRATION_DDL);

		const { rows: versionRows } = await client.query<{ id: string }>(
			`INSERT INTO "hips_version" ("version_no") VALUES ('HIPs 2025') RETURNING "id"`,
		);
		hipsVersionId = versionRows[0].id;
		const { rows: typeRows } = await client.query<{ id: string }>(
			`INSERT INTO "hazard_type" ("name", "hips_version_id") VALUES ('Geohazards', $1) RETURNING "id"`,
			[versionRows[0].id],
		);
		hazardTypeId = typeRows[0].id;
		const { rows: clusterRows } = await client.query<{ id: string }>(
			`INSERT INTO "hazard_cluster" ("name", "hazard_type_id") VALUES ('Seismogenic (Earthquakes)', $1) RETURNING "id"`,
			[hazardTypeId],
		);
		hazardClusterId = clusterRows[0].id;
		const { rows: hazardRows } = await client.query<{ id: string }>(
			`INSERT INTO "specific_hazard" ("name", "code", "hazard_cluster_id") VALUES ('Earthquake', 'GH0001', $1) RETURNING "id"`,
			[hazardClusterId],
		);
		specificHazardId = hazardRows[0].id;
		const { rows: dupNameRows } = await client.query<{ id: string }>(
			`INSERT INTO "specific_hazard" ("name", "code", "hazard_cluster_id") VALUES ('Earthquake', 'GH0003', $1) RETURNING "id"`,
			[hazardClusterId],
		);
		duplicateNameHazardId = dupNameRows[0].id;

		const migrationSql = readFileSync(MIGRATION_PATH, "utf-8");
		const statements = migrationSql
			.split("--> statement-breakpoint")
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		for (const statement of statements) {
			await client.query(statement);
		}

		dr = drizzle(client);
	}, 30000); // full DDL + migration + seed can exceed the 10s default under full-suite load

	afterAll(async () => {
		await client.close();
	});

	it("drops the plain name column from all three tables", async () => {
		const { rows } = await client.query<{ table_name: string }>(
			`SELECT table_name FROM information_schema.columns
			 WHERE column_name = 'name' AND table_name IN ('hazard_type', 'hazard_cluster', 'specific_hazard')`,
		);
		expect(rows).toHaveLength(0);
	});

	it.each([
		["hazard_type", () => hazardTypeId, "Geohazards"],
		["hazard_cluster", () => hazardClusterId, "Seismogenic (Earthquakes)"],
		["specific_hazard", () => specificHazardId, "Earthquake"],
	])(
		"%s's name_text_content_id resolves to the original name under the en language, with a matching translation row",
		async (table, getId, originalName) => {
			const { rows } = await client.query<{
				original_text: string;
				language_cd: string;
				name_text_content_id: string;
			}>(
				`SELECT tc."original_text", l."language_cd", t."name_text_content_id"
				 FROM "${table}" t
				 JOIN "text_content" tc ON tc."id" = t."name_text_content_id"
				 JOIN "language" l ON l."id" = tc."original_language_id"
				 WHERE t."id" = $1`,
				[getId()],
			);
			expect(rows[0].original_text).toBe(originalName);
			expect(rows[0].language_cd).toBe("en");

			const { rows: translationRows } = await client.query<{
				translation: string;
				language_cd: string;
			}>(
				`SELECT tr."translation", l."language_cd"
				 FROM "translation" tr
				 JOIN "language" l ON l."id" = tr."language_id"
				 WHERE tr."text_content_id" = $1`,
				[rows[0].name_text_content_id],
			);
			expect(translationRows).toHaveLength(1);
			expect(translationRows[0].translation).toBe(originalName);
			expect(translationRows[0].language_cd).toBe("en");
		},
	);

	it("gives two pre-existing rows with the same original name their own distinct text_content/translation rows (no dedup)", async () => {
		const { rows } = await client.query<{ name_text_content_id: string }>(
			`SELECT "name_text_content_id" FROM "specific_hazard" WHERE "id" IN ($1, $2)`,
			[specificHazardId, duplicateNameHazardId],
		);
		const textContentIds = rows.map((r) => r.name_text_content_id);
		expect(new Set(textContentIds).size).toBe(2);

		for (const textContentId of textContentIds) {
			const { rows: translationRows } = await client.query<{
				translation: string;
			}>(
				`SELECT "translation" FROM "translation" WHERE "text_content_id" = $1`,
				[textContentId],
			);
			expect(translationRows).toHaveLength(1);
			expect(translationRows[0].translation).toBe("Earthquake");
		}
	});

	it("does not alter code or the hazard_cluster_id/hazard_type_id/hips_version_id chain references", async () => {
		const { rows: hazardRows } = await client.query<{
			code: string;
			hazard_cluster_id: string;
		}>(
			`SELECT "code", "hazard_cluster_id" FROM "specific_hazard" WHERE "id" = $1`,
			[specificHazardId],
		);
		expect(hazardRows[0].code).toBe("GH0001");
		expect(hazardRows[0].hazard_cluster_id).toBe(hazardClusterId);

		const { rows: clusterRows } = await client.query<{
			hazard_type_id: string;
		}>(`SELECT "hazard_type_id" FROM "hazard_cluster" WHERE "id" = $1`, [
			hazardClusterId,
		]);
		expect(clusterRows[0].hazard_type_id).toBe(hazardTypeId);

		const { rows: typeRows } = await client.query<{
			hips_version_id: string;
		}>(`SELECT "hips_version_id" FROM "hazard_type" WHERE "id" = $1`, [
			hazardTypeId,
		]);
		expect(typeRows[0].hips_version_id).toBe(hipsVersionId);
	});

	it("leaves description_text_content_id and source_ref_id NULL on the pre-existing specific_hazard row", async () => {
		const { rows } = await client.query<{
			description_text_content_id: string | null;
			source_ref_id: string | null;
		}>(
			`SELECT "description_text_content_id", "source_ref_id" FROM "specific_hazard" WHERE "id" = $1`,
			[specificHazardId],
		);
		expect(rows[0].description_text_content_id).toBeNull();
		expect(rows[0].source_ref_id).toBeNull();
	});

	it("seeds all 9 VALID_LANGUAGES codes including en", async () => {
		const { rows } = await client.query<{ language_cd: string }>(
			`SELECT "language_cd" FROM "language" ORDER BY "language_cd"`,
		);
		const codes = rows.map((r) => r.language_cd).sort();
		expect(codes).toEqual(
			["ar", "en", "es", "fr", "ru", "sq", "sr", "tg", "zh"].sort(),
		);
	});

	it("resolves every column of all 6 schema objects against the real migrated DB (catches a TS/SQL column-name mismatch)", async () => {
		// No `casing` option on the real `dr`, so an emptied column-name string silently
		// falls back to the camelCase JS key instead of erroring at definition time.
		const [language] = await dr.select().from(languageTable).limit(1);
		expect(language.languageCd).toBe("en");

		const [textContent] = await dr.select().from(textContentTable).limit(1);
		expect(textContent.originalText).toBeTruthy();

		const [translationRow] = await dr.select().from(translationTable).limit(1);
		expect(translationRow.translation).toBeTruthy();

		const [hazardType] = await dr
			.select()
			.from(hazardTypeTable)
			.where(eq(hazardTypeTable.id, hazardTypeId));
		expect(hazardType.hipsVersionId).toBe(hipsVersionId);
		expect(hazardType.nameTextContentId).toBeTruthy();

		const [hazardCluster] = await dr
			.select()
			.from(hazardClusterTable)
			.where(eq(hazardClusterTable.id, hazardClusterId));
		expect(hazardCluster.hazardTypeId).toBe(hazardTypeId);

		const [specificHazard] = await dr
			.select()
			.from(specificHazardTable)
			.where(eq(specificHazardTable.id, specificHazardId));
		expect(specificHazard.hazardClusterId).toBe(hazardClusterId);
		expect(specificHazard.code).toBe("GH0001");
		expect(specificHazard.sourceRefId).toBeNull();
		expect(specificHazard.descriptionTextContentId).toBeNull();
	});

	it("allows a second post-migration row with no source_ref_id (multiple NULLs allowed)", async () => {
		const { rows: languageRows } = await client.query<{ id: string }>(
			`SELECT "id" FROM "language" WHERE "language_cd" = 'en'`,
		);
		const languageId = languageRows[0].id;
		const { rows: tcRows } = await client.query<{ id: string }>(
			`INSERT INTO "text_content" ("original_text", "original_language_id") VALUES ('Tsunami', $1) RETURNING "id"`,
			[languageId],
		);
		await client.query(
			`INSERT INTO "translation" ("text_content_id", "language_id", "translation") VALUES ($1, $2, 'Tsunami')`,
			[tcRows[0].id, languageId],
		);

		await expect(
			client.query(
				`INSERT INTO "specific_hazard" ("name_text_content_id", "code", "hazard_cluster_id") VALUES ($1, 'GH0002', $2)`,
				[tcRows[0].id, hazardClusterId],
			),
		).resolves.not.toThrow();
	});
});
