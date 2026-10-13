import { afterEach, describe, expect, it, vi } from "vitest";

describe("getAvailableLanguages", () => {
	afterEach(() => {
		vi.doUnmock("~/utils/lang.backend");
		vi.resetModules();
	});

	it("includes a VALID_LANGUAGES entry with complete locale files, previously excluded by the narrower whitelist", async () => {
		const { getAvailableLanguages } =
			await import("~/backend.server/translations");

		const languages = getAvailableLanguages();

		expect(languages).toEqual(expect.arrayContaining(["zh", "fr", "es", "tg"]));
	});

	it("excludes a VALID_LANGUAGES entry that has no locale files on disk", async () => {
		vi.resetModules();
		vi.doMock("~/utils/lang.backend", () => ({
			VALID_LANGUAGES: ["en", "zz"],
			DEFAULT_LANGUAGE: "en",
		}));

		const { getAvailableLanguages } =
			await import("~/backend.server/translations");

		expect(getAvailableLanguages()).not.toContain("zz");
	});

	it("excludes a language with locale files on disk that is absent from VALID_LANGUAGES", async () => {
		vi.resetModules();
		vi.doMock("~/utils/lang.backend", () => ({
			VALID_LANGUAGES: ["en"],
			DEFAULT_LANGUAGE: "en",
		}));

		const { getAvailableLanguages } =
			await import("~/backend.server/translations");

		// "fr" has real locale files on disk but is excluded here by the mocked VALID_LANGUAGES.
		expect(getAvailableLanguages()).toEqual(["en"]);
	});
});
