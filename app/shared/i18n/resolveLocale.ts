// Pure by design (design.md Decision 3): caller resolves each field, no Request/DB access here.
export interface LocaleResolutionInput {
	acceptLanguageHeader: string | null;
	userPreferredLocale: string | null;
	tenantDefaultLocale: string | null;
	supportedLocales: readonly string[];
}

// Framework-agnostic (design.md Decision 4) -- resolveLocale() is a shared utility, not a
// NestJS-only one, so it must not import @nestjs/common. DomainErrorFilter recognizes this
// type explicitly and maps it to 400.
export class InvalidLocaleTagError extends Error {
	readonly code = "INVALID_LOCALE_TAG";
	readonly supportedLocales: readonly string[];

	constructor(supportedLocales: readonly string[]) {
		super("Invalid Accept-Language tag");
		this.name = "InvalidLocaleTagError";
		this.supportedLocales = supportedLocales;
	}
}

// BCP 47 syntax only, no RFC 4647 q= weighting — DELTA needs a single preferred tag.
const BCP_47_PATTERN = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;

// ADR-001 fallback chain: Accept-Language -> userPreferredLocale -> tenantDefaultLocale -> "en".
// An invalid tag throws 400; a valid-but-unsupported tag just falls through (design.md Decision 4).
export function resolveLocale(input: LocaleResolutionInput): string {
	const {
		acceptLanguageHeader,
		userPreferredLocale,
		tenantDefaultLocale,
		supportedLocales,
	} = input;

	if (acceptLanguageHeader !== null) {
		const matched = matchAcceptLanguage(acceptLanguageHeader, supportedLocales);
		if (matched !== null) {
			return matched;
		}
	}

	if (
		userPreferredLocale !== null &&
		supportedLocales.includes(userPreferredLocale)
	) {
		return userPreferredLocale;
	}

	if (
		tenantDefaultLocale !== null &&
		supportedLocales.includes(tenantDefaultLocale)
	) {
		return tenantDefaultLocale;
	}

	return "en";
}

// Comma-separated, q-weighted list per RFC 7231 §5.3.5, e.g. "en-US,en;q=0.9,fr;q=0.8" —
// no q-weight sorting, header order only (Decision 10: single-tag need, not full RFC 4647).
function matchAcceptLanguage(
	header: string,
	supportedLocales: readonly string[],
): string | null {
	const entries = header
		.split(",")
		.map((entry) => entry.split(";")[0].trim())
		.filter((entry) => entry.length > 0);

	// Validate all entries first so one malformed entry throws even after an earlier match.
	for (const entry of entries) {
		if (entry === "*") continue;
		if (!BCP_47_PATTERN.test(entry)) {
			throw new InvalidLocaleTagError(supportedLocales);
		}
	}

	for (const entry of entries) {
		if (entry === "*") continue;
		if (supportedLocales.includes(entry)) {
			return entry;
		}
		const primarySubtag = entry.split("-")[0];
		if (supportedLocales.includes(primarySubtag)) {
			return primarySubtag;
		}
	}

	return null;
}
