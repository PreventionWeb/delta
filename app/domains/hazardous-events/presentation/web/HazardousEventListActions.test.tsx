import { describe, it, expect, vi, beforeAll } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import { TranslationGetter } from "~/utils/translator";

// Satisfies useViewContext()'s unconditional .t build (kept only for .lang/.url here) --
// same harness as HazardousEventListPage.test.tsx.
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

import { HazardousEventListActions } from "~/domains/hazardous-events/presentation/web/HazardousEventListActions";

// Inline mirror of locales/en/hazardous-events.json's list.* keys this component uses
// (Notices precedent -- no file import).
const hazardousEvents = {
	list: {
		add_new_event: "Add new event",
		resource_actions: "Resource actions",
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

function renderAt(ui: React.ReactElement): string {
	return renderToString(
		<MemoryRouter initialEntries={["/en/he-preview"]}>
			<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>
		</MemoryRouter>,
	);
}

describe("HazardousEventListActions (design.md Decision 15)", () => {
	it.each(["data-collector", "data-validator", "admin"])(
		"renders an 'Add new event' link to /en/he-preview/new for role %s",
		(role) => {
			const html = renderAt(<HazardousEventListActions role={role} />);

			expect(html).toContain('href="/en/he-preview/new"');
			expect(html).toContain("Add new event");
		},
	);

	it("renders no link for role: data-viewer", () => {
		const html = renderAt(<HazardousEventListActions role="data-viewer" />);

		expect(html).not.toContain("/en/he-preview/new");
		expect(html).not.toContain("Add new event");
	});

	it("renders no link for role: null", () => {
		const html = renderAt(<HazardousEventListActions role={null} />);

		expect(html).not.toContain("/en/he-preview/new");
	});

	it("renders no link for role: undefined (no role prop at all)", () => {
		const html = renderAt(<HazardousEventListActions />);

		expect(html).not.toContain("/en/he-preview/new");
	});
});
