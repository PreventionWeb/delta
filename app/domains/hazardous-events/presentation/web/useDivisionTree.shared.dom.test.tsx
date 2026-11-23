import {
	describe,
	it,
	expect,
	vi,
	beforeAll,
	beforeEach,
	afterEach,
} from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import type { TranslationGetter } from "~/utils/translator";
import type { DivisionTreeNode } from "./divisionTree";
import type { DivisionTreeState } from "./useDivisionTree";

// Real divisionTree cache shared between hook instances; only fetch and the root loader are stubbed.
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

const TREE: DivisionTreeNode[] = [
	{
		id: "div-1",
		parentId: null,
		name: "Abyan Governorate",
		children: [],
		has_children: false,
		hiddenData: {},
		path: "Abyan Governorate",
		ids: "div-1",
	},
];

function jsonResponse(body: unknown, ok = true): Response {
	return { ok, json: () => Promise.resolve(body) } as Response;
}

const fetchMock = vi.fn<typeof fetch>();

// Warm the cold module compile once (seconds under load); resetModules keeps the compile cache.
beforeAll(async () => {
	await import("./useDivisionTree");
}, 60000);

beforeEach(() => {
	// The cache is module-level -- a fresh module per test keeps tests independent.
	vi.resetModules();
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
	vi.stubGlobal(
		"createTranslationGetter",
		(_lang: string) => stubTranslationGetter,
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("useDivisionTree across instances (shared cache)", () => {
	it("an instance whose fetch failed becomes ready once another instance's retry caches the tree", async () => {
		const { useDivisionTree } = await import("./useDivisionTree");
		fetchMock.mockResolvedValueOnce(jsonResponse(null, false));
		const first = renderHook(() => useDivisionTree());
		await waitFor(() => expect(first.result.current.status).toBe("error"));

		fetchMock.mockResolvedValueOnce(jsonResponse(TREE));
		const second = renderHook(() => useDivisionTree());
		await waitFor(() =>
			expect(second.result.current).toEqual({ status: "ready", tree: TREE }),
		);

		await waitFor(() =>
			expect(first.result.current).toEqual({ status: "ready", tree: TREE }),
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("an instance mounted disabled, enabled after another instance cached the tree, is ready on its first enabled render", async () => {
		const { useDivisionTree } = await import("./useDivisionTree");
		const renders: DivisionTreeState[] = [];
		const late = renderHook(
			({ enabled }) => {
				const state = useDivisionTree(enabled);
				renders.push(state);
				return state;
			},
			{ initialProps: { enabled: false } },
		);

		fetchMock.mockResolvedValueOnce(jsonResponse(TREE));
		const loader = renderHook(() => useDivisionTree());
		await waitFor(() => expect(loader.result.current.status).toBe("ready"));

		renders.length = 0;
		late.rerender({ enabled: true });

		expect(renders[0]).toEqual({ status: "ready", tree: TREE });
		expect(renders.every((state) => state.status === "ready")).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
