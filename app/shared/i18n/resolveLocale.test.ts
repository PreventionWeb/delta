import { describe, it, expect } from "vitest";
import {
	resolveLocale,
	InvalidLocaleTagError,
	type LocaleResolutionInput,
} from "./resolveLocale";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal valid input. Overrides can be provided per test. */
function buildInput(
	overrides: Partial<LocaleResolutionInput> = {},
): LocaleResolutionInput {
	return {
		acceptLanguageHeader: null,
		userPreferredLocale: null,
		tenantDefaultLocale: null,
		supportedLocales: ["en", "fr", "es"],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveLocale", () => {
	// -------------------------------------------------------------------------
	// Fallback chain
	// -------------------------------------------------------------------------

	it("returns the Accept-Language tag when it is supported", () => {
		const result = resolveLocale(
			buildInput({ acceptLanguageHeader: "fr", userPreferredLocale: "es" }),
		);
		expect(result).toBe("fr");
	});

	it("falls through to userPreferredLocale when Accept-Language is absent", () => {
		const result = resolveLocale(
			buildInput({
				acceptLanguageHeader: null,
				userPreferredLocale: "es",
				tenantDefaultLocale: "fr",
			}),
		);
		expect(result).toBe("es");
	});

	it("falls through to tenantDefaultLocale when Accept-Language and userPreferredLocale are absent", () => {
		const result = resolveLocale(
			buildInput({
				acceptLanguageHeader: null,
				userPreferredLocale: null,
				tenantDefaultLocale: "fr",
			}),
		);
		expect(result).toBe("fr");
	});

	it('falls back to "en" when every chain step is absent', () => {
		const result = resolveLocale(
			buildInput({
				acceptLanguageHeader: null,
				userPreferredLocale: null,
				tenantDefaultLocale: null,
			}),
		);
		expect(result).toBe("en");
	});

	// -------------------------------------------------------------------------
	// Invalid vs. unsupported Accept-Language
	// -------------------------------------------------------------------------

	it("throws InvalidLocaleTagError for a syntactically invalid Accept-Language tag", () => {
		expect(() =>
			resolveLocale(buildInput({ acceptLanguageHeader: "xx_yy!!" })),
		).toThrow(InvalidLocaleTagError);
	});

	it("InvalidLocaleTagError lists every supportedLocales entry", () => {
		const supportedLocales = ["en", "fr", "es"];
		try {
			resolveLocale(
				buildInput({ acceptLanguageHeader: "xx_yy!!", supportedLocales }),
			);
			expect.unreachable("resolveLocale should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(InvalidLocaleTagError);
			expect((err as InvalidLocaleTagError).supportedLocales).toEqual(
				supportedLocales,
			);
		}
	});

	it("does not throw for a syntactically valid but unsupported tag, and falls through silently", () => {
		const result = resolveLocale(
			buildInput({ acceptLanguageHeader: "de", userPreferredLocale: "es" }),
		);
		expect(result).toBe("es");
	});

	// -------------------------------------------------------------------------
	// Purity — no side effects, deterministic
	// -------------------------------------------------------------------------

	it("is a pure function: identical input twice produces the same output", () => {
		const input = buildInput({ acceptLanguageHeader: "fr" });
		const result1 = resolveLocale(input);
		const result2 = resolveLocale(input);
		expect(result1).toBe(result2);
	});

	// -------------------------------------------------------------------------
	// Real HTTP list parsing (design.md Decision 10) — comma-separated,
	// q-weighted, wildcard-tolerant, with primary-subtag folding
	// -------------------------------------------------------------------------

	it("resolves a realistic multi-value, q-weighted header without throwing", () => {
		const result = resolveLocale(
			buildInput({
				acceptLanguageHeader: "en-US,en;q=0.9,fr;q=0.8",
				supportedLocales: ["en", "fr", "es"],
			}),
		);
		expect(result).toBe("en");
	});

	it("folds a region subtag onto its supported primary subtag", () => {
		const result = resolveLocale(
			buildInput({
				acceptLanguageHeader: "en-US",
				supportedLocales: ["en", "fr", "es"],
			}),
		);
		expect(result).toBe("en");
	});

	it("skips a lone wildcard entry instead of rejecting it", () => {
		const result = resolveLocale(
			buildInput({
				acceptLanguageHeader: "*",
				userPreferredLocale: null,
				tenantDefaultLocale: null,
			}),
		);
		expect(result).toBe("en");
	});

	it("throws when one entry among otherwise-valid entries is malformed", () => {
		expect(() =>
			resolveLocale(buildInput({ acceptLanguageHeader: "en,xx_yy!!,fr" })),
		).toThrow(InvalidLocaleTagError);
	});

	it("an empty Accept-Language string falls through without throwing", () => {
		const result = resolveLocale(
			buildInput({ acceptLanguageHeader: "", userPreferredLocale: "es" }),
		);
		expect(result).toBe("es");
	});

	it("a whitespace/commas-only Accept-Language string falls through without throwing", () => {
		const result = resolveLocale(
			buildInput({ acceptLanguageHeader: " , , ", userPreferredLocale: "es" }),
		);
		expect(result).toBe("es");
	});
});
