import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	clearDbCreatedMarker,
	hasDbCreatedMarker,
	resolvePlaywrightDatabaseConfig,
	writeDbCreatedMarker,
} from "../../../tests/e2e/helpers/e2eDbGuard";

describe("e2eDbGuard", () => {
	const tempMarkers: string[] = [];

	afterEach(() => {
		for (const p of tempMarkers.splice(0)) {
			if (fs.existsSync(p)) {
				fs.rmSync(p, { force: true });
			}
		}
	});

	it("throws when PLAYWRIGHT_DATABASE_URL is missing even if DATABASE_URL is set", () => {
		expect(() =>
			resolvePlaywrightDatabaseConfig({
				DATABASE_URL:
					"postgresql://postgres:postgres@localhost:5432/unog_training",
			}),
		).toThrow(/PLAYWRIGHT_DATABASE_URL/);
	});

	it("rejects non-test database names such as unog_training or delta", () => {
		expect(() =>
			resolvePlaywrightDatabaseConfig({
				PLAYWRIGHT_DATABASE_URL:
					"postgresql://postgres:postgres@localhost:5432/unog_training",
			}),
		).toThrow(/non-test database/i);

		expect(() =>
			resolvePlaywrightDatabaseConfig({
				PLAYWRIGHT_DATABASE_URL:
					"postgresql://postgres:postgres@localhost:5432/delta",
			}),
		).toThrow(/non-test database/i);
	});

	it("rejects SQL-unsafe characters in database name", () => {
		expect(() =>
			resolvePlaywrightDatabaseConfig({
				PLAYWRIGHT_DATABASE_URL:
					"postgresql://postgres:postgres@localhost:5432/delta_e2e;%20DROP%20DATABASE%20prod--",
			}),
		).toThrow(/invalid database identifier|non-test database/i);
	});

	it("accepts valid *_test, *_e2e, and *_playwright database URLs", () => {
		for (const dbName of ["delta_test", "delta_e2e", "unog_playwright"]) {
			const cfg = resolvePlaywrightDatabaseConfig({
				PLAYWRIGHT_DATABASE_URL: `postgresql://pguser:pgpass@127.0.0.1:5433/${dbName}`,
			});
			expect(cfg).toEqual({
				databaseUrl: `postgresql://pguser:pgpass@127.0.0.1:5433/${dbName}`,
				dbName,
				host: "127.0.0.1",
				port: 5433,
				user: "pguser",
				password: "pgpass",
			});
		}
	});

	it("gates teardown via setup-created marker matching target dbName", () => {
		const markerPath = path.join(
			os.tmpdir(),
			`delta-e2e-marker-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
		);
		tempMarkers.push(markerPath);

		expect(hasDbCreatedMarker("delta_e2e", markerPath)).toBe(false);

		writeDbCreatedMarker("delta_e2e", markerPath);
		expect(hasDbCreatedMarker("delta_e2e", markerPath)).toBe(true);
		expect(hasDbCreatedMarker("other_e2e", markerPath)).toBe(false);

		clearDbCreatedMarker(markerPath);
		expect(hasDbCreatedMarker("delta_e2e", markerPath)).toBe(false);
	});
});
