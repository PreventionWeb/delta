import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import { TranslationGetter } from "~/utils/translator";
import { HazardousEventParentField } from "./HazardousEventParentField";

// Satisfies useViewContext()'s unconditional .t build (same stub pattern as
// HazardousEventListPage.test.tsx).
const stubTranslationGetter: TranslationGetter = (params) => ({
	msg: params.msg ?? params.code,
});
vi.stubGlobal(
	"createTranslationGetter",
	(_lang: string) => stubTranslationGetter,
);

vi.mock("react-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router")>();
	return {
		...actual,
		useRouteLoaderData: vi.fn(() => ({ common: { lang: "en", user: null } })),
	};
});

const hazardousEvents = {
	form: {
		fields: { parent: "Parent" },
		actions: { change: "Change", unset: "Unset" },
	},
};

let testI18n: I18n;

beforeAll(async () => {
	testI18n = i18n.createInstance();
	await testI18n.use(initReactI18next).init({
		lng: "en",
		fallbackLng: "en",
		ns: ["hazardous-events"],
		defaultNS: "hazardous-events",
		resources: { en: { "hazardous-events": hazardousEvents } },
	});
});

function renderField() {
	return render(
		<MemoryRouter initialEntries={["/en/he-preview/new"]}>
			<I18nextProvider i18n={testI18n}>
				<HazardousEventParentField initialParent={null} />
			</I18nextProvider>
		</MemoryRouter>,
	);
}

// design.md Decision 22 (found live, 2026-11-03): legacy's own openHazardousEventPicker
// (hazardeventform.tsx:325-326) opens a real tab (target "_blank", no features string) --
// the current window-name + features-string call shape forces a small chrome-less popup.
describe("HazardousEventParentField Change button (task 9i.2/9i.3)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("opens the picker as a real tab, not a sized popup window", () => {
		const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
		renderField();

		fireEvent.click(screen.getByRole("button", { name: "Change" }));

		expect(openSpy).toHaveBeenCalledTimes(1);
		expect(openSpy).toHaveBeenCalledWith("/en/he-preview/picker", "_blank");
	});
});
