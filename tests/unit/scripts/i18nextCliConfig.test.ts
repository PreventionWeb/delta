import { describe, expect, it } from "vitest";
import { VALID_LANGUAGES } from "~/utils/lang.backend";
import config from "../../../i18next.config";

describe("i18next.config.ts", () => {
	it("outputs to locales/**/*.json namespace files, not locales/app/", () => {
		expect(config.extract.output).toBe("locales/{{language}}/{{namespace}}.json");
		expect(config.extract.output).not.toContain("locales/app");
	});

	it("scans app/**/*.{ts,tsx} source files for t('key') calls", () => {
		expect(config.extract.input).toContain("app/**/*.{ts,tsx}");
	});

	it("reuses VALID_LANGUAGES rather than hardcoding a second locale list", () => {
		expect(config.locales).toEqual(VALID_LANGUAGES);
	});

	it("excludes the permanent E2E fixture namespace from automated extraction", () => {
		expect(config.extract.ignoreNamespaces).toContain("__e2e_fixture__");
	});
});
