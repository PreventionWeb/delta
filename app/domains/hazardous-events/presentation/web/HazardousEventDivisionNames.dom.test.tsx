import {
	describe,
	it,
	expect,
	vi,
	beforeAll,
	beforeEach,
	afterEach,
} from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import type { TranslationGetter } from "~/utils/translator";

// useViewContext() (for the tree URL) needs a stubbed root loader and a global translation getter.
const stubTranslationGetter: TranslationGetter = (params) => ({
	msg: params.msg ?? params.code,
});
vi.mock("react-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router")>();
	return {
		...actual,
		useRouteLoaderData: vi.fn(() => ({ common: { lang: "en", user: null } })),
	};
});

const hazardousEvents = {
	form: {
		spatial_footprint: {
			division_dialog: {
				loading: "Loading divisions…",
				unknown_division: "Unknown division ({{id}})",
			},
		},
	},
	detail: { spatial_observation: { division_ids: "Divisions" } },
};

const TREE = [
	{
		id: "div-parent",
		parentId: null,
		name: "Abyan Governorate",
		children: [
			{
				id: "div-1",
				parentId: "div-parent",
				name: "Zinjibar",
				children: [],
				has_children: false,
				hiddenData: {},
				path: "Abyan Governorate / Zinjibar",
				ids: "div-parent,div-1",
			},
		],
		has_children: true,
		hiddenData: {},
		path: "Abyan Governorate",
		ids: "div-parent",
	},
];

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
	// Warm the cold module compile once (seconds under load); resetModules keeps the compile cache.
	await import("./HazardousEventDivisionNames");
}, 60000);

beforeEach(() => {
	// divisionTree's fetch cache is module-level -- a fresh module per test keeps them independent.
	vi.resetModules();
	vi.stubGlobal(
		"createTranslationGetter",
		(_lang: string) => stubTranslationGetter,
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

async function renderNames(divisionIds: readonly string[]) {
	const { HazardousEventDivisionNames } =
		await import("./HazardousEventDivisionNames");
	return render(
		<I18nextProvider i18n={testI18n}>
			<HazardousEventDivisionNames divisionIds={divisionIds} />
		</I18nextProvider>,
	);
}

describe("HazardousEventDivisionNames", () => {
	it("shows each division by breadcrumb path, and an unknown one by the form's fallback label -- never a raw id alone", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: true, status: 200, json: async () => TREE })),
		);

		await renderNames(["div-1", "div-gone"]);

		const list = await screen.findByRole("list", { name: "Divisions" });
		const items = [...list.querySelectorAll("li")].map((li) => li.textContent);
		expect(items).toEqual([
			"Abyan Governorate / Zinjibar",
			"Unknown division (div-gone)",
		]);
	});

	it("shows a loading status until the tree arrives", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise(() => {})),
		);

		await renderNames(["div-1"]);

		expect(screen.getByRole("status").textContent).toBe("Loading divisions…");
		expect(screen.queryByRole("list")).toBeNull();
	});

	it("falls back to the unknown-division label for every id when the tree fetch fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
		);

		await renderNames(["div-1"]);

		const list = await screen.findByRole("list", { name: "Divisions" });
		expect(list.textContent).toBe("Unknown division (div-1)");
	});
});
