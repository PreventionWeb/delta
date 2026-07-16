import { describe, expect, it } from "vitest";
import { VALID_LANGUAGES } from "~/utils/lang.backend";
import config from "../../../i18next-parser.config.js";

describe("i18next-parser.config.js", () => {
	it("outputs to locales/**/*.json namespace files, not locales/app/", () => {
		expect(config.output).toBe("locales/$LOCALE/$NAMESPACE.json");
		expect(config.output).not.toContain("locales/app");
	});

	it("scans app/**/*.{ts,tsx} source files for t('key') calls", () => {
		expect(config.input).toContain("app/**/*.{ts,tsx}");
	});

	it("reuses VALID_LANGUAGES rather than hardcoding a second locale list", () => {
		expect(config.locales).toEqual(VALID_LANGUAGES);
	});
});
