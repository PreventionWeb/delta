/**
 * Server-side i18next wiring for ADR-001's react-i18next/remix-i18next stack.
 * Coexists with the existing ViewContext.t({code, msg}) system; registered
 * in app/root.tsx after requestContextMiddleware. See
 * openspec/changes/ca-i18n-adr001-infra/design.md and locales/README.md for
 * the namespace-per-domain file convention this reads from.
 */

import { join } from "node:path";
import FsBackend from "i18next-fs-backend";
import { createI18nextMiddleware } from "remix-i18next";
import { DEFAULT_LANGUAGE, VALID_LANGUAGES } from "~/utils/lang.backend";
import { getCountrySettingsFromSession } from "~/utils/session";
import { getPinoLogger } from "~/infrastructure/logging/PinoLogger.server";

// remix-i18next@8 (RR8) passes the full middleware args, not a bare Request — derived from
// its own public Options type since LanguageDetectorArgs itself isn't exported.
export type FindLocaleArgs = Parameters<
	NonNullable<createI18nextMiddleware.Options["detection"]["findLocale"]>
>[0];

// ADR-001's 4-step locale resolution chain (design.md Decision 3).
export async function findLocale(args: FindLocaleArgs): Promise<string | null> {
	const { request } = args;
	try {
		const segment = new URL(request.url).pathname.split("/")[1];
		if (VALID_LANGUAGES.includes(segment)) return segment; // step 1: URL segment

		// step 2: user.preferredLocale — column doesn't exist yet, hook point only
		// const preferred = await getPreferredLocaleForUser(userId);
		// if (preferred) return preferred;

		const countrySettings = await getCountrySettingsFromSession(request);
		if (countrySettings?.language) return countrySettings.language; // step 3: tenant default

		return null; // step 4: fallbackLanguage applies
	} catch (err) {
		// Fail-open on malformed requests, but still surface unexpected failures.
		getPinoLogger().error({ msg: "findLocale failed", err });
		return null;
	}
}

export const [i18nextMiddleware, getLocale, getInstance] =
	createI18nextMiddleware({
		i18next: {
			// fs-backend reads from disk per-request instead of eagerly loading
			// every domain/language into memory (design.md Decision 2).
			backend: {
				loadPath: join(process.cwd(), "locales/{{lng}}/{{ns}}.json"),
			},
			supportedLngs: VALID_LANGUAGES,
			fallbackLng: DEFAULT_LANGUAGE,
			ns: [], // populated per-route once a domain adopts this system
		},
		plugins: [FsBackend],
		detection: {
			supportedLanguages: VALID_LANGUAGES,
			fallbackLanguage: DEFAULT_LANGUAGE,
			order: ["custom"], // no cookie/session/header — ADR-001 doesn't call for one
			findLocale,
		},
	});

// Purpose-built accessor so callers that only need the resource bundle (e.g.
// app/root.tsx, for client hydration) don't have to know getInstance's raw
// i18next API shape.
export function getResourceBundle(
	context: Parameters<typeof getInstance>[0],
	lang: string,
): Record<string, Record<string, string>> {
	return getInstance(context).getDataByLanguage(lang) ?? {};
}
