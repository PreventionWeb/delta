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
	testDb = drizzle(client, { schema });

	// Push schema directly (no migrations needed). extensionsFilters excludes
	// PostGIS's own catalog tables (spatial_ref_sys etc.) from the diff.
	const result = await pushSchema(schema, testDb, undefined, undefined, [
		"postgis",
	]);
	await result.apply(); // executes the SQL to create tables

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
