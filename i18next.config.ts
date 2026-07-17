// New t('key') extraction pipeline, coexists with scripts/extractor-i18n.ts — see design.md.
import { defineConfig } from "i18next-cli";
import { VALID_LANGUAGES } from "./app/utils/lang.backend";

export default defineConfig({
	locales: VALID_LANGUAGES,
	extract: {
		input: ["app/**/*.{ts,tsx}"],
		output: "locales/{{language}}/{{namespace}}.json",
		defaultNS: "translation",
		sort: true,
		// __e2e_fixture__ is hand-crafted and intentionally partial (e.g. no es/) — never auto-managed.
		ignoreNamespaces: ["__e2e_fixture__"],
	},
});
