import {
	describe,
	it,
	expect,
	vi,
	beforeEach,
	afterEach,
	beforeAll,
} from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import type { TranslationGetter } from "~/utils/translator";

// useViewContext() (for ctx.url()'s lang-prefixed fetch URLs) needs both a stubbed root loader
// data and a global translation getter -- same stubs HazardousEventFormPage.dom.test.tsx already
// uses for this exact hook.
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

// jsdom tier -- real pointer interaction (row click, chip remove) and RAC's Tree/Dialog portal
// behavior both need a real DOM, not renderToString.

// Real `/api/division/tree` response shape (buildTree()): root nodes array, each
// `{ id, parentId, name, children, has_children, hiddenData, path, ids }`, recursive. `name` is
// already a plain string (resolved server-side), not a raw i18n object.
interface DivisionTreeNodeFixture {
	id: string;
	parentId: string | null;
	name: string;
	children: DivisionTreeNodeFixture[];
	has_children: boolean;
	hiddenData: Record<string, string>;
	path: string;
	ids: string;
}

const DIVISION_TREE_FIXTURE: DivisionTreeNodeFixture[] = [
	{
		id: "div-country",
		parentId: null,
		name: "Testland",
		children: [
			{
				id: "div-region",
				parentId: "div-country",
				name: "North Region",
				children: [],
				has_children: false,
				hiddenData: {
					importId: "",
					nationalId: "",
					level: "1",
					name: "North Region",
				},
				path: "Testland / North Region",
				ids: "div-country,div-region",
			},
		],
		has_children: true,
		hiddenData: { importId: "", nationalId: "", level: "0", name: "Testland" },
		path: "Testland",
		ids: "div-country",
	},
];

// Own i18n fixture, not imported from the real locale file. `form.close` is reused as-is
// (already shipped, used by the two sibling modals in this same directory).
const hazardousEvents = {
	form: {
		close: "Close",
		spatial_footprint: {
			division_dialog: {
				title: "Select geographic level",
				loading: "Loading divisions…",
				error: "Unable to load divisions.",
				empty: "No divisions available.",
				unknown_division: "Unknown division ({{id}})",
				remove: "Remove {{name}}",
				expand_all: "Expand All",
				collapse_all: "Collapse All",
				search_placeholder: "Search...",
				root_caption: "Geographic levels",
				no_results: "No results found",
				selected_caption: "Selected",
				apply: "Apply",
				discard: "Discard",
			},
		},
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
		// i18next's default escaping, as at runtime -- catches "/" in labels becoming &#x2F;.
		resources: { en: { "hazardous-events": hazardousEvents } },
	});
});

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
	return { ok, status, json: async () => body } as Response;
}

beforeEach(() => {
	// The dialog's own fetch-cache (mirroring leafletLoader.ts's module-level `leafletPromise`,
	// Decision 5/Risks) is module-level state -- a fresh module instance per test avoids one
	// test's resolved/cached tree leaking into the next.
	vi.resetModules();
	vi.stubGlobal("fetch", vi.fn());
	// Re-armed every test -- the afterEach below clears all stubbed globals, including this one.
	vi.stubGlobal(
		"createTranslationGetter",
		(_lang: string) => stubTranslationGetter,
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

// Text of every node removed while `update` runs -- a stale first frame shows up here even
// though the final DOM is correct.
function removedTextDuring(update: () => void): string {
	const observer = new MutationObserver(() => {});
	observer.observe(document.body, { childList: true, subtree: true });
	update();
	const removed = observer
		.takeRecords()
		.flatMap((record) => [...record.removedNodes])
		.map((node) => node.textContent ?? "")
		.join("|");
	observer.disconnect();
	return removed;
}

async function importDialog() {
	return await import("./HazardousEventDivisionListDialog");
}

function renderDialog(
	Dialog: typeof import("./HazardousEventDivisionListDialog").HazardousEventDivisionListDialog,
	props: Partial<
		import("./HazardousEventDivisionListDialog").HazardousEventDivisionListDialogProps
	> = {},
) {
	const defaultProps: import("./HazardousEventDivisionListDialog").HazardousEventDivisionListDialogProps =
		{
			isOpen: true,
			initialSelectedIds: [],
			onApply: () => {},
			onDiscard: () => {},
		};
	return render(
		<I18nextProvider i18n={testI18n}>
			<Dialog {...defaultProps} {...props} />
		</I18nextProvider>,
	);
}

describe("HazardousEventDivisionListDialog (task group 3)", () => {
	// RAC's Tree does a heavier first-mount pass than this suite's other components; the default
	// 5000ms budget is tight under concurrent test-runner load.
	it("fetches /api/division/tree on open and renders a collapsed hierarchical tree under legacy's root caption", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(jsonResponse(DIVISION_TREE_FIXTURE));
		const { HazardousEventDivisionListDialog } = await importDialog();

		renderDialog(HazardousEventDivisionListDialog);

		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining("/api/division/tree"),
			expect.anything(),
		);
		// RAC's Tree is a treegrid of rows named by textValue; hierarchy via aria-level/expanded.
		const parentRow = await screen.findByRole("row", { name: "Testland" });
		expect(screen.getByText("Geographic levels")).toBeTruthy();
		// Collapsed on open, as legacy -- children render only once expanded.
		expect(parentRow.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByRole("row", { name: "North Region" })).toBeNull();
	}, 15000);

	it("disables Expand All when the tree has no expandable levels", async () => {
		const leafOnly = DIVISION_TREE_FIXTURE[0].children[0];
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse([{ ...leafOnly, parentId: null }]),
		);
		const { HazardousEventDivisionListDialog } = await importDialog();
		renderDialog(HazardousEventDivisionListDialog);
		await screen.findByRole("row", { name: "North Region" });

		expect(
			(screen.getByRole("button", { name: "Expand All" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	}, 15000);

	it("Expand All reveals every level and Collapse All hides them again, each disabled when it has nothing to do", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(DIVISION_TREE_FIXTURE));
		const { HazardousEventDivisionListDialog } = await importDialog();
		renderDialog(HazardousEventDivisionListDialog);
		await screen.findByRole("row", { name: "Testland" });

		const expandAll = () =>
			screen.getByRole("button", { name: "Expand All" }) as HTMLButtonElement;
		const collapseAll = () =>
			screen.getByRole("button", { name: "Collapse All" }) as HTMLButtonElement;
		expect(collapseAll().disabled).toBe(true);

		await user.click(expandAll());
		expect(
			await screen.findByRole("row", { name: "North Region" }),
		).toBeTruthy();
		expect(expandAll().disabled).toBe(true);

		await user.click(collapseAll());
		expect(screen.queryByRole("row", { name: "North Region" })).toBeNull();
		expect(collapseAll().disabled).toBe(true);
	}, 15000);

	it("search keeps matches with their ancestors, expanded, and says so when nothing matches", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(DIVISION_TREE_FIXTURE));
		const { HazardousEventDivisionListDialog } = await importDialog();
		renderDialog(HazardousEventDivisionListDialog);
		await screen.findByRole("row", { name: "Testland" });

		const search = screen.getByRole("searchbox", { name: "Search..." });
		await user.type(search, "north");
		expect(
			await screen.findByRole("row", { name: "North Region" }),
		).toBeTruthy();
		expect(screen.getByRole("row", { name: "Testland" })).toBeTruthy();

		await user.clear(search);
		await user.type(search, "zzz");
		expect(await screen.findByText("No results found")).toBeTruthy();
	}, 15000);

	it("a pick hidden by the search filter survives checking another, in pick order", async () => {
		const user = userEvent.setup();
		const southland = {
			...DIVISION_TREE_FIXTURE[0].children[0],
			id: "div-south",
			parentId: null,
			name: "Southland",
			path: "Southland",
			ids: "div-south",
		};
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse([...DIVISION_TREE_FIXTURE, southland]),
		);
		const onApply = vi.fn();
		const { HazardousEventDivisionListDialog } = await importDialog();
		renderDialog(HazardousEventDivisionListDialog, { onApply });

		const southRow = await screen.findByRole("row", { name: "Southland" });
		await user.click(within(southRow).getByRole("checkbox"));
		await user.type(
			screen.getByRole("searchbox", { name: "Search..." }),
			"north",
		);
		const northRow = await screen.findByRole("row", { name: "North Region" });
		expect(screen.queryByRole("row", { name: "Southland" })).toBeNull();
		await user.click(within(northRow).getByRole("checkbox"));

		await user.click(screen.getByRole("button", { name: "Apply" }));
		expect(onApply).toHaveBeenCalledWith(["div-south", "div-region"]);
	}, 15000);

	it("checking divisions lists them as path chips (unescaped), removing a chip unchecks it, and Apply returns the rest", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(DIVISION_TREE_FIXTURE));
		const onApply = vi.fn();
		const { HazardousEventDivisionListDialog } = await importDialog();
		renderDialog(HazardousEventDivisionListDialog, { onApply });
		await screen.findByRole("row", { name: "Testland" });
		await user.click(screen.getByRole("button", { name: "Expand All" }));

		const childRow = await screen.findByRole("row", { name: "North Region" });
		await user.click(within(childRow).getByRole("checkbox"));
		const parentRow = screen.getByRole("row", { name: "Testland" });
		await user.click(within(parentRow).getByRole("checkbox"));

		expect(
			screen.getByRole("button", { name: "Remove Testland / North Region" }),
		).toBeTruthy();
		expect(childRow.getAttribute("aria-selected")).toBe("true");

		await user.click(screen.getByRole("button", { name: "Remove Testland" }));
		expect(parentRow.getAttribute("aria-selected")).toBe("false");

		await user.click(screen.getByRole("button", { name: "Apply" }));
		expect(onApply).toHaveBeenCalledWith(["div-region"]);
	}, 15000);

	it("opens with initialSelectedIds pre-checked -- including one absent from the live tree, labelled as unknown and removable", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(DIVISION_TREE_FIXTURE));
		const onApply = vi.fn();
		const { HazardousEventDivisionListDialog } = await importDialog();
		renderDialog(HazardousEventDivisionListDialog, {
			initialSelectedIds: ["div-country", "div-stale-and-gone"],
			onApply,
		});

		const parentRow = await screen.findByRole("row", { name: "Testland" });
		expect(parentRow.getAttribute("aria-selected")).toBe("true");
		await user.click(
			screen.getByRole("button", {
				name: "Remove Unknown division (div-stale-and-gone)",
			}),
		);
		await user.click(screen.getByRole("button", { name: "Apply" }));
		expect(onApply).toHaveBeenCalledWith(["div-country"]);
	}, 15000);

	it("Escape in the search box clears the search and keeps the dialog open; Escape on an empty box discards as usual", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(DIVISION_TREE_FIXTURE));
		const onDiscard = vi.fn();
		const { HazardousEventDivisionListDialog } = await importDialog();
		renderDialog(HazardousEventDivisionListDialog, {
			initialSelectedIds: ["div-country"],
			onDiscard,
		});
		await screen.findByRole("row", { name: "Testland" });
		const search = screen.getByRole("searchbox", {
			name: "Search...",
		}) as HTMLInputElement;

		await user.type(search, "north");
		await user.keyboard("{Escape}");

		expect(search.value).toBe("");
		expect(onDiscard).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", { name: "Remove Testland" }),
		).toBeTruthy();

		await user.keyboard("{Escape}");
		expect(onDiscard).toHaveBeenCalledTimes(1);
	}, 15000);

	it("a reopen starts from the new ids in its very first frame -- the previous session's chips never flash", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse(DIVISION_TREE_FIXTURE));
		const { HazardousEventDivisionListDialog: Dialog } = await importDialog();
		const view = (isOpen: boolean, ids: readonly string[]) => (
			<I18nextProvider i18n={testI18n}>
				<Dialog
					isOpen={isOpen}
					initialSelectedIds={ids}
					onApply={() => {}}
					onDiscard={() => {}}
				/>
			</I18nextProvider>
		);
		const { rerender } = render(view(true, ["div-stale-and-gone"]));
		await screen.findByRole("row", { name: "Testland" });
		rerender(view(false, ["div-stale-and-gone"]));

		const removed = removedTextDuring(() =>
			rerender(view(true, ["div-country"])),
		);

		expect(removed).not.toContain("div-stale-and-gone");
		expect(
			screen.getByRole("button", { name: "Remove Testland" }),
		).toBeTruthy();
	}, 15000);

	it("Discard and the header close button both call onDiscard, never onApply", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(DIVISION_TREE_FIXTURE));
		const onApply = vi.fn();
		const onDiscard = vi.fn();
		const { HazardousEventDivisionListDialog } = await importDialog();
		renderDialog(HazardousEventDivisionListDialog, { onApply, onDiscard });
		const parentRow = await screen.findByRole("row", { name: "Testland" });
		await user.click(within(parentRow).getByRole("checkbox"));

		await user.click(screen.getByRole("button", { name: "Discard" }));
		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(onDiscard).toHaveBeenCalledTimes(2);
		expect(onApply).not.toHaveBeenCalled();
	}, 15000);

	it("opening the dialog twice in quick succession, before the first tree fetch resolves, makes exactly one request to /api/division/tree", async () => {
		let resolveFetch!: (value: Response) => void;
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockReturnValue(
			new Promise<Response>((resolve) => {
				resolveFetch = resolve;
			}),
		);
		const { HazardousEventDivisionListDialog } = await importDialog();

		const { rerender } = render(
			<I18nextProvider i18n={testI18n}>
				<HazardousEventDivisionListDialog
					isOpen={false}
					initialSelectedIds={[]}
					onApply={() => {}}
					onDiscard={() => {}}
				/>
			</I18nextProvider>,
		);

		// Open #1
		rerender(
			<I18nextProvider i18n={testI18n}>
				<HazardousEventDivisionListDialog
					isOpen
					initialSelectedIds={[]}
					onApply={() => {}}
					onDiscard={() => {}}
				/>
			</I18nextProvider>,
		);
		// Close, then open #2 -- both before the single in-flight fetch above ever resolves.
		rerender(
			<I18nextProvider i18n={testI18n}>
				<HazardousEventDivisionListDialog
					isOpen={false}
					initialSelectedIds={[]}
					onApply={() => {}}
					onDiscard={() => {}}
				/>
			</I18nextProvider>,
		);
		rerender(
			<I18nextProvider i18n={testI18n}>
				<HazardousEventDivisionListDialog
					isOpen
					initialSelectedIds={[]}
					onApply={() => {}}
					onDiscard={() => {}}
				/>
			</I18nextProvider>,
		);

		resolveFetch(jsonResponse(DIVISION_TREE_FIXTURE));

		expect(await screen.findByRole("row", { name: "Testland" })).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("shows a loading indicator while the /api/division/tree fetch is still pending", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
		const { HazardousEventDivisionListDialog } = await importDialog();

		renderDialog(HazardousEventDivisionListDialog);

		expect((await screen.findByRole("status")).textContent).toContain(
			"Loading divisions…",
		);
	});

	it("shows an error message, not a crash, when the /api/division/tree fetch rejects", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockRejectedValue(new Error("network down"));
		const { HazardousEventDivisionListDialog } = await importDialog();

		renderDialog(HazardousEventDivisionListDialog);

		expect((await screen.findByRole("alert")).textContent).toContain(
			"Unable to load divisions.",
		);
	});

	it("shows an error message, not a crash, when the /api/division/tree fetch resolves non-ok", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(jsonResponse(null, false, 500));
		const { HazardousEventDivisionListDialog } = await importDialog();

		renderDialog(HazardousEventDivisionListDialog);

		expect((await screen.findByRole("alert")).textContent).toContain(
			"Unable to load divisions.",
		);
	});

	it("shows a no-divisions message, not a blank dialog, when the tenant has no divisions", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(jsonResponse([]));
		const { HazardousEventDivisionListDialog } = await importDialog();

		renderDialog(HazardousEventDivisionListDialog);

		expect(await screen.findByText("No divisions available.")).toBeTruthy();
	});
});
