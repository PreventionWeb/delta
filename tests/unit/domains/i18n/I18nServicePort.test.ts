import { describe, expect, it } from "vitest";
import type { I18nServicePort } from "~/shared/i18n/I18nServicePort";

// Pure interface, no runtime implementation shipped in this change (see
// openspec/changes/ca-i18n-adr001-infra/specs/i18n-service-port/spec.md). This
// is a type-level regression test: a minimal in-test mock implementing the
// port compiles only if the interface shape stays compatible with
// `translate(key, locale, params?) => Promise<string>`.
class MockI18nService implements I18nServicePort {
	async translate(
		key: string,
		locale: string,
		params?: Record<string, string | number>,
	): Promise<string> {
		return `${locale}:${key}:${JSON.stringify(params ?? {})}`;
	}
}

describe("I18nServicePort", () => {
	it("accepts a minimal mock implementation with the documented signature", async () => {
		const service = new MockI18nService();
		const result = await service.translate("greeting", "en", { count: 1 });
		expect(result).toBe('en:greeting:{"count":1}');
	});

	it("allows params to be omitted", async () => {
		const service = new MockI18nService();
		const result = await service.translate("greeting", "fr");
		expect(result).toBe("fr:greeting:{}");
	});
});
