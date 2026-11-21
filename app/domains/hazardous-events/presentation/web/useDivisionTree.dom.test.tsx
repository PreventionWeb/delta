import {
	describe,
	it,
	expect,
	vi,
	beforeAll,
	beforeEach,
	afterEach,
} from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import i18n, { type i18n as I18n } from "i18next";
import type { TranslationGetter } from "~/utils/translator";
import type { DivisionTreeNode } from "./divisionTree";

// useViewContext() (for the tree URL) needs a stubbed root loader and translation getter.
const stubTranslationGetter: TranslationGetter = (params) => ({
	msg: params.msg ?? params.code,
});
const route = vi.hoisted(() => ({ lang: "en" }));
vi.mock("react-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router")>();
	return {
		...actual,
		useRouteLoaderData: vi.fn(() => ({
			common: { lang: route.lang, user: null },
		})),
	};
});

// Non-caching stand-in -- the real per-URL cache is covered by divisionTree.test.ts.
const fetchDivisionTree = vi.fn<(url: string) => Promise<DivisionTreeNode[]>>();
const cachedDivisionTree = vi.fn<(url: string) => DivisionTreeNode[] | null>();
vi.mock("./divisionTree", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./divisionTree")>();
	return {
		...actual,
		fetchDivisionTree: (url: string) => fetchDivisionTree(url),
		cachedDivisionTree: (url: string) => cachedDivisionTree(url),
	};
});

import { useDivisionTree, divisionLabel } from "./useDivisionTree";

const TREE: DivisionTreeNode[] = [
	{
		id: "div-1",
		parentId: null,
		name: "Abyan Governorate",
		children: [
			{
				id: "div-2",
				parentId: "div-1",
				name: "Zinjibar",
				children: [],
				has_children: false,
				hiddenData: {},
				path: "Abyan Governorate / Zinjibar",
				ids: "div-1,div-2",
			},
		],
		has_children: true,
		hiddenData: {},
		path: "Abyan Governorate",
		ids: "div-1",
	},
];

let testI18n: I18n;

beforeAll(async () => {
	testI18n = i18n.createInstance();
	await testI18n.init({
		lng: "en",
		ns: ["hazardous-events"],
		defaultNS: "hazardous-events",
		resources: {
			en: {
				"hazardous-events": {
					form: {
						spatial_footprint: {
							division_dialog: {
								unknown_division: "Unknown division ({{id}})",
							},
						},
					},
				},
			},
		},
	});
});

beforeEach(() => {
	vi.stubGlobal(
		"createTranslationGetter",
		(_lang: string) => stubTranslationGetter,
	);
	fetchDivisionTree.mockReset();
	cachedDivisionTree.mockReset();
	cachedDivisionTree.mockReturnValue(null);
	route.lang = "en";
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("divisionLabel", () => {
	const t = () => testI18n.getFixedT("en", "hazardous-events");

	it("is the division's breadcrumb path when the tree has it", () => {
		expect(divisionLabel(TREE, "div-2", t())).toBe(
			"Abyan Governorate / Zinjibar",
		);
	});

	it("is the unknown-division text, naming the id, when the tree doesn't have it", () => {
		expect(divisionLabel(TREE, "div-9", t())).toBe("Unknown division (div-9)");
		expect(divisionLabel([], "div-1", t())).toBe("Unknown division (div-1)");
	});
});

describe("useDivisionTree", () => {
	it("fetches the lang-prefixed tree and reports loading, then ready", async () => {
		fetchDivisionTree.mockResolvedValue(TREE);

		const { result } = renderHook(() => useDivisionTree());

		expect(result.current).toEqual({ status: "loading", tree: [] });
		await waitFor(() =>
			expect(result.current).toEqual({ status: "ready", tree: TREE }),
		);
		expect(fetchDivisionTree).toHaveBeenCalledWith("/en/api/division/tree");
	});

	it("starts ready when the tree is already cached -- no loading or unknown-label flash on reopen", () => {
		cachedDivisionTree.mockReturnValue(TREE);
		fetchDivisionTree.mockResolvedValue(TREE);

		const { result } = renderHook(() => useDivisionTree());

		expect(result.current).toEqual({ status: "ready", tree: TREE });
		expect(cachedDivisionTree).toHaveBeenCalledWith("/en/api/division/tree");
	});

	it("a URL (language) change drops the previous URL's tree until the new one loads", async () => {
		fetchDivisionTree.mockResolvedValueOnce(TREE);
		const { result, rerender } = renderHook(() => useDivisionTree());
		await waitFor(() => expect(result.current.status).toBe("ready"));

		fetchDivisionTree.mockReturnValueOnce(new Promise(() => {}));
		route.lang = "fr";
		rerender();

		expect(result.current).toEqual({ status: "loading", tree: [] });
		expect(fetchDivisionTree).toHaveBeenLastCalledWith("/fr/api/division/tree");
	});

	it("ignores a previous URL's fetch that resolves after the URL changed", async () => {
		let resolveEn: (tree: DivisionTreeNode[]) => void = () => {};
		fetchDivisionTree.mockReturnValueOnce(
			new Promise((r) => {
				resolveEn = r;
			}),
		);
		const { result, rerender } = renderHook(() => useDivisionTree());

		fetchDivisionTree.mockReturnValueOnce(new Promise(() => {}));
		route.lang = "fr";
		rerender();
		await act(async () => {
			resolveEn(TREE);
		});

		expect(result.current).toEqual({ status: "loading", tree: [] });
	});

	it("a URL change to an already-cached tree starts ready", async () => {
		fetchDivisionTree.mockResolvedValue(TREE);
		const { result, rerender } = renderHook(() => useDivisionTree());
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const frTree: DivisionTreeNode[] = [{ ...TREE[0], id: "div-fr" }];
		cachedDivisionTree.mockImplementation((url) =>
			url === "/fr/api/division/tree" ? frTree : null,
		);
		fetchDivisionTree.mockResolvedValue(frTree);
		route.lang = "fr";
		rerender();

		expect(result.current).toEqual({ status: "ready", tree: frTree });
	});

	it("does not fetch while disabled", () => {
		const { result } = renderHook(() => useDivisionTree(false));

		expect(fetchDivisionTree).not.toHaveBeenCalled();
		expect(result.current).toEqual({ status: "loading", tree: [] });
	});

	it("reports a failed fetch as error, and retries (loading again) when re-enabled", async () => {
		fetchDivisionTree.mockRejectedValueOnce(new Error("offline"));
		const { result, rerender } = renderHook(
			({ enabled }) => useDivisionTree(enabled),
			{ initialProps: { enabled: true } },
		);
		await waitFor(() =>
			expect(result.current).toEqual({ status: "error", tree: [] }),
		);

		let resolve: (tree: DivisionTreeNode[]) => void = () => {};
		fetchDivisionTree.mockReturnValueOnce(
			new Promise((r) => {
				resolve = r;
			}),
		);
		rerender({ enabled: false });
		rerender({ enabled: true });

		await waitFor(() => expect(result.current.status).toBe("loading"));
		resolve(TREE);
		await waitFor(() =>
			expect(result.current).toEqual({ status: "ready", tree: TREE }),
		);
		expect(fetchDivisionTree).toHaveBeenCalledTimes(2);
	});
});
