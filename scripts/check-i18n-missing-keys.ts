// Non-blocking missing-key report for locales/<lang>/<domain>.json namespace
// files only — never evaluates locales/app/. See
// openspec/changes/ca-i18n-adr001-infra/design.md Decision 6.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_LANGUAGE, VALID_LANGUAGES } from "../app/utils/lang.backend";

export interface MissingKeyReport {
	domain: string;
	locale: string;
	missingKeys: string[];
}

export interface CheckMissingKeysResult {
	domainsChecked: number;
	missing: MissingKeyReport[];
}

const REFERENCE_LOCALE = DEFAULT_LANGUAGE;

// Returns an empty set for a missing file (expected — not every locale has
// every namespace yet) but warns on a malformed one, since that's a real
// authoring bug this check would otherwise hide.
function readKeySet(filePath: string): Set<string> {
	if (!existsSync(filePath)) return new Set();
	try {
		const content = JSON.parse(readFileSync(filePath, "utf-8"));
		return new Set(Object.keys(content));
	} catch (err) {
		console.warn(
			`[i18n-check] skipping unreadable file ${filePath}: ${(err as Error).message}`,
		);
		return new Set();
	}
}

export function checkMissingKeys(
	localesDir: string,
	locales: string[] = VALID_LANGUAGES,
	referenceLocale: string = REFERENCE_LOCALE,
): CheckMissingKeysResult {
	const referenceDir = join(localesDir, referenceLocale);
	if (!existsSync(referenceDir)) {
		return { domainsChecked: 0, missing: [] };
	}

	// __*__ namespaces (e.g. the E2E fixture) are intentionally single-locale; skip them.
	const domains = readdirSync(referenceDir)
		.filter((file) => file.endsWith(".json"))
		.map((file) => file.slice(0, -".json".length))
		.filter((domain) => !/^__.*__$/.test(domain));

	const missing: MissingKeyReport[] = [];

	for (const domain of domains) {
		const referenceKeys = readKeySet(join(referenceDir, `${domain}.json`));

		for (const locale of locales) {
			if (locale === referenceLocale) continue;

			const localeKeys = readKeySet(join(localesDir, locale, `${domain}.json`));

			const missingKeys = [...referenceKeys].filter(
				(key) => !localeKeys.has(key),
			);
			if (missingKeys.length > 0) {
				missing.push({ domain, locale, missingKeys });
			}
		}
	}

	return { domainsChecked: domains.length, missing };
}

// CLI entry point. Always exits 0 — this is a report-only signal, never a
// merge gate (design.md Decision 6).
// pathToFileURL (not a manual `file://` template) so this comparison is
// correct on Windows (backslashes, drive letters) as well as POSIX.
if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const { domainsChecked, missing } = checkMissingKeys(
		join(process.cwd(), "locales"),
	);

	console.log(`[i18n-check] ${domainsChecked} domain(s) checked.`);
	for (const { domain, locale, missingKeys } of missing) {
		console.warn(
			`[i18n-check] locale "${locale}", domain "${domain}": missing ${missingKeys.length} key(s) — ${missingKeys.join(", ")}`,
		);
	}

	process.exit(0);
}
