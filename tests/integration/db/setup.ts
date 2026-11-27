import { afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./testSchema/";

const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const { pushSchema } = require("drizzle-kit/api");

let testDb: any;

vi.mock("~/db.server", async (importOriginal) => {
	const original = await importOriginal<any>();

	if (testDb) {
		return { ...original, dr: testDb };
	}

	const client = new PGlite({ extensions: { postgis } }); // in-memory, auto-created
	await client.exec("CREATE EXTENSION IF NOT EXISTS postgis;");
	// Mirrors app/drizzle/migrations/20260129075114_sectors_db_funcs.sql — pushSchema only
	// creates tables, not migration-defined SQL functions.
	await client.exec(`
		CREATE OR REPLACE FUNCTION public.dts_jsonb_localized(data jsonb, lang text)
		RETURNS text LANGUAGE sql IMMUTABLE AS $$
			SELECT COALESCE(data->>lang, data->>'en', '')
		$$;
	`);
	const {
		countryAccounts,
		userCountryAccounts,
		...restSchema
	} = schema;
	testDb = drizzle(client, {
		schema: {
			...restSchema,
			countryAccountsTable: countryAccounts,
			userCountryAccountsTable: userCountryAccounts,
		},
	});

	// Push schema directly (no migrations needed). extensionsFilters excludes
	// PostGIS's own catalog tables (spatial_ref_sys etc.) from the diff.
	const result = await pushSchema(schema, testDb, undefined, undefined, [
		"postgis",
	]);
	await result.apply(); // executes the SQL to create tables

	await client.exec(`
		CREATE OR REPLACE FUNCTION public.dts_get_sector_all_idonly(param_sector_id uuid)
		RETURNS uuid[] LANGUAGE plpgsql AS $$
		BEGIN
			RETURN ARRAY(
				WITH RECURSIVE ParentCTE AS (
					SELECT id, parent_id FROM sector WHERE id = param_sector_id
					UNION ALL
					SELECT s.id, s.parent_id FROM sector s INNER JOIN ParentCTE p ON s.id = p.parent_id
				),
				ChildCTE AS (
					SELECT id, parent_id FROM sector WHERE id = param_sector_id
					UNION ALL
					SELECT t.id, t.parent_id FROM sector t INNER JOIN ChildCTE c ON t.parent_id = c.id
				)
				SELECT id FROM ParentCTE UNION SELECT id FROM ChildCTE
			);
		END;
		$$;

		CREATE OR REPLACE FUNCTION public.dts_get_sector_ancestors_descendants(lang text, sector_id uuid)
		RETURNS json LANGUAGE sql AS $$
			WITH RECURSIVE ParentCTE AS (
				SELECT id, dts_jsonb_localized(name, lang) as sectorname, parent_id, level
				FROM sector WHERE id = sector_id
				UNION ALL
				SELECT t.id, dts_jsonb_localized(t.name, lang) as sectorname, t.parent_id, t.level
				FROM sector t INNER JOIN ParentCTE p ON t.id = p.parent_id
			),
			ChildCTE AS (
				SELECT id, dts_jsonb_localized(name, lang) as sectorname, parent_id, level
				FROM sector WHERE id = sector_id
				UNION ALL
				SELECT t.id, dts_jsonb_localized(t.name, lang) as sectorname, t.parent_id, t.level
				FROM sector t INNER JOIN ChildCTE c ON t.parent_id = c.id
			)
			SELECT json_agg(row_to_json(all_records))
			FROM (
				SELECT id, sectorname, level FROM ParentCTE WHERE level = 2
				UNION
				SELECT id, sectorname, level FROM ChildCTE
			) all_records;
		$$;

		CREATE OR REPLACE FUNCTION public.dts_get_sector_descendants(lang text, sector_id uuid)
		RETURNS json LANGUAGE sql AS $$
			WITH RECURSIVE ChildCTE AS (
				SELECT id, dts_jsonb_localized(name, lang) as sectorname, parent_id, level
				FROM sector WHERE id = sector_id
				UNION ALL
				SELECT t.id, dts_jsonb_localized(t.name, lang) as sectorname, t.parent_id, t.level
				FROM sector t INNER JOIN ChildCTE c ON t.parent_id = c.id
			)
			SELECT json_agg(row_to_json(all_records))
			FROM (
				SELECT id, sectorname, level FROM ChildCTE
			) all_records;
		$$;

		CREATE OR REPLACE FUNCTION public.dts_get_sector_parent_idonly(param_sector_id uuid)
		RETURNS uuid[] LANGUAGE plpgsql AS $$
		BEGIN
			RETURN ARRAY(
				WITH RECURSIVE ParentCTE AS (
					SELECT id, parent_id FROM sector WHERE id = param_sector_id
					UNION ALL
					SELECT s.id, s.parent_id FROM sector s INNER JOIN ParentCTE p ON s.id = p.parent_id
				)
				SELECT id FROM ParentCTE
			);
		END;
		$$;

		CREATE OR REPLACE FUNCTION public.dts_get_sector_children_idonly(param_sector_id uuid)
		RETURNS uuid[] LANGUAGE plpgsql AS $$
		BEGIN
			RETURN ARRAY(
				WITH RECURSIVE ChildCTE AS (
					SELECT id, parent_id FROM sector WHERE id = param_sector_id
					UNION ALL
					SELECT t.id, t.parent_id FROM sector t INNER JOIN ChildCTE c ON t.parent_id = c.id
				)
				SELECT id FROM ChildCTE
			);
		END;
		$$;
	`);

	return {
		...original,
		dr: testDb,
		// If you export other things like pool, override them too if needed
	};
});

// PGlite cleans up automatically on process exit, but optional:
afterAll(async () => {
	if (testDb?.$client) {
		await testDb.$client.close();
	}
});
