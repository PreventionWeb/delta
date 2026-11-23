import { test as teardown } from "@playwright/test";
import { Client } from "pg";
import {
	clearDbCreatedMarker,
	hasDbCreatedMarker,
	resolvePlaywrightDatabaseConfig,
} from "./helpers/e2eDbGuard";

teardown("delete database", async ({}) => {
	const cfg = resolvePlaywrightDatabaseConfig(process.env);

	// Never terminate sessions or drop a database that global.setup.ts did not create.
	if (!hasDbCreatedMarker(cfg.dbName)) {
		console.log(
			`Skipping teardown drop for '${cfg.dbName}': no setup-created marker found.`,
		);
		return;
	}

	console.log("deleting test database...");

	const client = new Client({
		host: cfg.host,
		port: cfg.port,
		user: cfg.user,
		password: cfg.password,
		database: "postgres",
	});

	try {
		await client.connect();

		await client.query(
			`
			SELECT pg_terminate_backend(pg_stat_activity.pid)
			FROM pg_stat_activity
			WHERE pg_stat_activity.datname = $1
			AND pid <> pg_backend_pid()
			`,
			[cfg.dbName],
		);

		await client.query(`DROP DATABASE IF EXISTS "${cfg.dbName}"`);

		console.log(`✓ Database '${cfg.dbName}' deleted successfully`);
	} catch (error) {
		console.error("Error deleting database:", error);
		throw error;
	} finally {
		clearDbCreatedMarker();
		await client.end();
	}
});
