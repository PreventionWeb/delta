import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { checkMissingKeys } from "../../../scripts/check-i18n-missing-keys";

const SCRIPT_PATH = resolve(
	import.meta.dirname,
	"../../../scripts/check-i18n-missing-keys.ts",
);
const TSX_CLI = resolve(
	import.meta.dirname,
	"../../../node_modules/tsx/dist/cli.mjs",
);

// Fixture root mimics a project directory: <fixtureRoot>/locales/<lang>/<domain>.json.
// Not the real locales/ tree, so this test doesn't depend on any domain's
// future retrofit. See
// openspec/changes/ca-i18n-adr001-infra/specs/i18n-missing-key-ci-check/spec.md.
let fixtureRoot: string;
let localesDir: string;

function writeNamespaceFile(
	locale: string,
	domain: string,
	content: Record<string, string>,
) {
	const dir = join(localesDir, locale);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${domain}.json`), JSON.stringify(content));
}

beforeEach(() => {
	fixtureRoot = mkdtempSync(join(tmpdir(), "i18n-missing-keys-"));
	localesDir = join(fixtureRoot, "locales");
});

afterEach(() => {
	rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("checkMissingKeys", () => {
	it("reports a key present in the reference locale but missing in another locale", () => {
		writeNamespaceFile("en", "notices", { "list.title": "Notices" });
		writeNamespaceFile("fr", "notices", {});

		const result = checkMissingKeys(localesDir, ["en", "fr"]);

		expect(result.domainsChecked).toBe(1);
		expect(result.missing).toEqual([
			{ domain: "notices", locale: "fr", missingKeys: ["list.title"] },
		]);
	});

	it("reports zero missing keys when every locale's key set matches the reference locale", () => {
		writeNamespaceFile("en", "notices", { "list.title": "Notices" });
		writeNamespaceFile("fr", "notices", { "list.title": "Avis" });

		const result = checkMissingKeys(localesDir, ["en", "fr"]);

		expect(result.domainsChecked).toBe(1);
		expect(result.missing).toEqual([]);
	});

	it("treats a malformed locale file as empty (all reference keys reported missing) and warns, without throwing", () => {
		writeNamespaceFile("en", "notices", { "list.title": "Notices" });
		mkdirSync(join(localesDir, "fr"), { recursive: true });
		writeFileSync(join(localesDir, "fr", "notices.json"), "{ not valid json");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = checkMissingKeys(localesDir, ["en", "fr"]);

		expect(result.missing).toEqual([
			{ domain: "notices", locale: "fr", missingKeys: ["list.title"] },
		]);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("notices.json"),
		);
		warnSpy.mockRestore();
	});

	it("skips __*__ fixture namespaces so they never appear as permanently missing", () => {
		writeNamespaceFile("en", "__e2e_fixture__", { greeting: "Hello" });
		writeNamespaceFile("fr", "__e2e_fixture__", { greeting: "Bonjour" });

		const result = checkMissingKeys(localesDir, ["en", "fr", "es"]);

		expect(result.domainsChecked).toBe(0);
		expect(result.missing).toEqual([]);
	});

	it("reports zero domains checked when no namespace files exist yet", () => {
		const result = checkMissingKeys(localesDir, ["en", "fr"]);

		expect(result.domainsChecked).toBe(0);
		expect(result.missing).toEqual([]);
	});

	// Exercises the actual CLI entry point (not just the pure function) so a
	// non-zero process.exit added later would be caught here.
	it("exits 0 as a real process even when missing keys are found", () => {
		writeNamespaceFile("en", "notices", { "list.title": "Notices" });
		writeNamespaceFile("fr", "notices", {});

		const result = spawnSync(process.execPath, [TSX_CLI, SCRIPT_PATH], {
			cwd: fixtureRoot,
			encoding: "utf-8",
		});

		expect(result.status).toBe(0);
		expect(result.stderr).toContain("list.title");
	});
});
