// New extraction pipeline for the react-i18next t('key') system — coexists
// with scripts/extractor-i18n.ts (old ctx.t({code, msg}) system). See
// openspec/changes/ca-i18n-adr001-infra/design.md and locales/README.md.
import { VALID_LANGUAGES } from "./app/utils/lang.backend.ts";

export default {
	locales: VALID_LANGUAGES,
	input: ["app/**/*.{ts,tsx}"],
	output: "locales/$LOCALE/$NAMESPACE.json",
	defaultNamespace: "translation",
	createOldCatalogs: false,
	sort: true,
};
