import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { DEFAULT_LANGUAGE } from "~/utils/lang.backend";

// Reads the resource bundle app/root.tsx serialized server-side, so hydration
// never issues a client-side HTTP fetch for translations (design.md Decision 4).
function readResourceBundle(): Record<string, Record<string, string>> {
	const el = document.getElementById("i18n-resource-bundle");
	if (!el?.textContent) return {};
	try {
		return JSON.parse(el.textContent);
	} catch {
		return {};
	}
}

async function hydrate() {
	const lng = document.documentElement.lang || DEFAULT_LANGUAGE;

	await i18next.use(initReactI18next).init({
		resources: { [lng]: readResourceBundle() },
		lng,
		fallbackLng: DEFAULT_LANGUAGE,
	});

	startTransition(() => {
		hydrateRoot(
			document,
			<StrictMode>
				<I18nextProvider i18n={i18next}>
					<HydratedRouter />
				</I18nextProvider>
			</StrictMode>,
		);
	});
}

hydrate();
