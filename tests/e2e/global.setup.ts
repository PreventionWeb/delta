import { test as setup } from "@playwright/test";
import { Client } from "pg";
import path from "path";
import { fileURLToPath } from "url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
	clearDbCreatedMarker,
	resolvePlaywrightDatabaseConfig,
	writeDbCreatedMarker,
} from "./helpers/e2eDbGuard";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

setup("create new database", async ({}) => {
	console.log("creating new database...");

	clearDbCreatedMarker();
	const cfg = resolvePlaywrightDatabaseConfig(process.env);

	const client = new Client({
		host: cfg.host,
		port: cfg.port,
		user: cfg.user,
		password: cfg.password,
		database: "postgres",
	});

	try {
		await client.connect();
		try {
			await client.query(`DROP DATABASE IF EXISTS "${cfg.dbName}"`);
			await client.query(`CREATE DATABASE "${cfg.dbName}"`);
			writeDbCreatedMarker(cfg.dbName);
		} finally {
			await client.end();
		}

		console.log(`✓ Database '${cfg.dbName}' created successfully`);

		const testDbClient = new Client({
			connectionString: cfg.databaseUrl,
		});

		await testDbClient.connect();
		try {
			console.log("Running Drizzle migrations...");

			const migrationsFolder = path.resolve(
				__dirname,
				"..",
				"..",
				"app",
				"drizzle",
				"migrations",
			);

			const db = drizzle(testDbClient);
			await migrate(db, { migrationsFolder });

			console.log("✓ Drizzle migrations completed successfully");
		} finally {
			await testDbClient.end();
		}
	} catch (error) {
		console.error("Error setting up database:", error);
		throw error;
	}
});
