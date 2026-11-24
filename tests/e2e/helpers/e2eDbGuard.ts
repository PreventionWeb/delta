import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface PlaywrightDbConfig {
	databaseUrl: string;
	dbName: string;
	host: string;
	port: number;
	user: string;
	password: string;
}

const SAFE_IDENTIFIER_RE = /^[a-zA-Z0-9_]+$/;
const TEST_DB_SUFFIX_RE = /_(test|e2e|playwright)$/;
const DEFAULT_MARKER_PATH = path.join(
	os.tmpdir(),
	"delta-playwright-db-created.json",
);

/**
 * Resolves and validates the dedicated Playwright E2E database connection.
 * Deliberately never falls back to DATABASE_URL so live/local databases cannot be dropped.
 */
export function resolvePlaywrightDatabaseConfig(
	env: NodeJS.ProcessEnv,
): PlaywrightDbConfig {
	const databaseUrl = env.PLAYWRIGHT_DATABASE_URL?.trim();
	if (!databaseUrl) {
		throw new Error(
			"PLAYWRIGHT_DATABASE_URL is required in .env.playwright for E2E tests (DATABASE_URL is intentionally ignored to protect live/local databases).",
		);
	}

	let url: URL;
	try {
		url = new URL(databaseUrl);
	} catch {
		throw new Error("PLAYWRIGHT_DATABASE_URL is not a valid URL.");
	}

	const dbName = decodeURIComponent(url.pathname.slice(1));
	if (!dbName || !SAFE_IDENTIFIER_RE.test(dbName)) {
		throw new Error(
			`Invalid database identifier "${dbName}" in PLAYWRIGHT_DATABASE_URL.`,
		);
	}

	if (!TEST_DB_SUFFIX_RE.test(dbName)) {
		throw new Error(
			`Refusing destructive E2E operation on non-test database "${dbName}". Database name must end with _test, _e2e, or _playwright.`,
		);
	}

	const parsedPort = url.port ? Number.parseInt(url.port, 10) : 5432;
	const port = Number.isFinite(parsedPort) ? parsedPort : 5432;

	return {
		databaseUrl,
		dbName,
		host: url.hostname,
		port,
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
	};
}

export function writeDbCreatedMarker(
	dbName: string,
	markerPath: string = DEFAULT_MARKER_PATH,
): void {
	fs.writeFileSync(
		markerPath,
		JSON.stringify({ dbName, createdAt: new Date().toISOString() }),
		"utf8",
	);
}

export function hasDbCreatedMarker(
	dbName: string,
	markerPath: string = DEFAULT_MARKER_PATH,
): boolean {
	if (!fs.existsSync(markerPath)) {
		return false;
	}
	try {
		const raw = fs.readFileSync(markerPath, "utf8");
		const parsed = JSON.parse(raw) as { dbName?: string };
		return parsed.dbName === dbName;
	} catch {
		return false;
	}
}

export function clearDbCreatedMarker(
	markerPath: string = DEFAULT_MARKER_PATH,
): void {
	if (fs.existsSync(markerPath)) {
		fs.rmSync(markerPath, { force: true });
	}
}
