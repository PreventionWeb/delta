import { describe, it, expect } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { AcceptLanguageI18nResolver } from "./AcceptLanguageI18nResolver.server";

function makeContext(acceptLanguage: string | undefined): ExecutionContext {
	return {
		switchToHttp: () => ({
			getRequest: () => ({ headers: { "accept-language": acceptLanguage } }),
		}),
	} as unknown as ExecutionContext;
}

describe("AcceptLanguageI18nResolver", () => {
	it("resolves a supported Accept-Language tag", () => {
		const resolver = new AcceptLanguageI18nResolver();

		expect(resolver.resolve(makeContext("fr"))).toBe("fr");
	});

	it("falls back to 'en' when no Accept-Language header is present", () => {
		const resolver = new AcceptLanguageI18nResolver();

		expect(resolver.resolve(makeContext(undefined))).toBe("en");
	});

	it("returns undefined (not a thrown error) for a malformed Accept-Language header", () => {
		// A malformed header must not break every request through this resolver — see the
		// WHY comment on the class itself for why this can't throw.
		const resolver = new AcceptLanguageI18nResolver();

		expect(() => resolver.resolve(makeContext("xx_yy!!"))).not.toThrow();
		expect(resolver.resolve(makeContext("xx_yy!!"))).toBeUndefined();
	});

	it("folds an unsupported region subtag to its supported primary subtag", () => {
		const resolver = new AcceptLanguageI18nResolver();

		expect(resolver.resolve(makeContext("en-US"))).toBe("en");
	});
});
