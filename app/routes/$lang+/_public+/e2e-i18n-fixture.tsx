// Permanent fixture route backing tests/e2e/i18n/ssr-locale-resolution.spec.ts
// — kept indefinitely; no real domain namespace exists yet to guard the SSR pipeline instead.
import type { LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";
import { getInstance } from "~/middleware/i18next.server";

export async function loader({ context }: LoaderFunctionArgs) {
	// ns: [] by default, so this namespace must be loaded before render
	await getInstance(context).loadNamespaces("__e2e_fixture__");
	return null;
}

export default function E2eI18nFixture() {
	const { t } = useTranslation("__e2e_fixture__");
	return <div data-testid="e2e-i18n-fixture">{t("greeting")}</div>;
}
