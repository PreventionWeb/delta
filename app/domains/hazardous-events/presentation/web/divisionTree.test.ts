import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	collectParentIds,
	filterDivisionTree,
	type DivisionTreeNode,
} from "./divisionTree";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
	return { ok, status, json: async () => body } as Response;
}

const TREE_FIXTURE = [
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
				hiddenData: {},
				path: "Testland / North Region",
				ids: "div-country,div-region",
			},
		],
		has_children: true,
		hiddenData: {},
		path: "Testland",
		ids: "div-country",
	},
];

beforeEach(() => {
	vi.resetModules();
	vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

async function importModule() {
	return await import("./divisionTree");
}

describe("fetchDivisionTree", () => {
	it("fetches and resolves the tree from the given URL", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(jsonResponse(TREE_FIXTURE));
		const { fetchDivisionTree } = await importModule();

		const tree = await fetchDivisionTree("/en/api/division/tree");

		expect(fetchMock).toHaveBeenCalledWith("/en/api/division/tree", {
			method: "GET",
		});
		expect(tree).toEqual(TREE_FIXTURE);
	});

	it("shares one in-flight request between concurrent callers", async () => {
		let resolveFetch!: (value: Response) => void;
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockReturnValue(
			new Promise<Response>((resolve) => {
				resolveFetch = resolve;
			}),
		);
		const { fetchDivisionTree } = await importModule();

		const first = fetchDivisionTree("/en/api/division/tree");
		const second = fetchDivisionTree("/en/api/division/tree");
		resolveFetch(jsonResponse(TREE_FIXTURE));

		await expect(first).resolves.toEqual(TREE_FIXTURE);
		await expect(second).resolves.toEqual(TREE_FIXTURE);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("does not share a cached result across two different URLs (e.g. an in-app language switch)", async () => {
		const EN_TREE = TREE_FIXTURE;
		const FR_TREE = [{ ...TREE_FIXTURE[0], name: "Terre de test" }];
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockImplementation((url) =>
			Promise.resolve(
				jsonResponse(String(url).includes("/fr/") ? FR_TREE : EN_TREE),
			),
		);
		const { fetchDivisionTree } = await importModule();

		const en = await fetchDivisionTree("/en/api/division/tree");
		const fr = await fetchDivisionTree("/fr/api/division/tree");

		expect(en).toEqual(EN_TREE);
		expect(fr).toEqual(FR_TREE);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("resets the cache on a non-ok response, so a later call retries", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(null, false, 500));
		fetchMock.mockResolvedValueOnce(jsonResponse(TREE_FIXTURE));
		const { fetchDivisionTree } = await importModule();

		await expect(fetchDivisionTree("/en/api/division/tree")).rejects.toThrow();
		await expect(fetchDivisionTree("/en/api/division/tree")).resolves.toEqual(
			TREE_FIXTURE,
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("resets the cache when the fetch itself rejects, so a later call retries", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockRejectedValueOnce(new Error("network down"));
		fetchMock.mockResolvedValueOnce(jsonResponse(TREE_FIXTURE));
		const { fetchDivisionTree } = await importModule();

		await expect(fetchDivisionTree("/en/api/division/tree")).rejects.toThrow();
		await expect(fetchDivisionTree("/en/api/division/tree")).resolves.toEqual(
			TREE_FIXTURE,
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe("cachedDivisionTree", () => {
	it("is null until a fetch for that url resolves, then the resolved tree", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse(TREE_FIXTURE));
		const { fetchDivisionTree, cachedDivisionTree } = await importModule();

		expect(cachedDivisionTree("/en/api/division/tree")).toBeNull();
		await fetchDivisionTree("/en/api/division/tree");

		expect(cachedDivisionTree("/en/api/division/tree")).toEqual(TREE_FIXTURE);
		expect(cachedDivisionTree("/fr/api/division/tree")).toBeNull();
	});

	it("stays null after a failed fetch", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse(null, false));
		const { fetchDivisionTree, cachedDivisionTree } = await importModule();

		await expect(fetchDivisionTree("/en/api/division/tree")).rejects.toThrow();

		expect(cachedDivisionTree("/en/api/division/tree")).toBeNull();
	});
});

describe("subscribeDivisionTree", () => {
	it("notifies on a resolved fetch, not a failed one, and stops after unsubscribing", async () => {
		const fetchMock = vi.mocked(fetch);
		const { fetchDivisionTree, subscribeDivisionTree } = await importModule();
		const listener = vi.fn();
		const unsubscribe = subscribeDivisionTree(listener);

		fetchMock.mockResolvedValueOnce(jsonResponse(null, false));
		await expect(fetchDivisionTree("/en/api/division/tree")).rejects.toThrow();
		expect(listener).not.toHaveBeenCalled();

		fetchMock.mockResolvedValueOnce(jsonResponse(TREE_FIXTURE));
		await fetchDivisionTree("/en/api/division/tree");
		expect(listener).toHaveBeenCalledTimes(1);

		unsubscribe();
		fetchMock.mockResolvedValueOnce(jsonResponse(TREE_FIXTURE));
		await fetchDivisionTree("/fr/api/division/tree");
		expect(listener).toHaveBeenCalledTimes(1);
	});
});

describe("findNode", () => {
	it("finds a root node by id", async () => {
		const { findNode } = await importModule();
		expect(findNode(TREE_FIXTURE, "div-country")?.name).toBe("Testland");
	});

	it("finds a nested child node by id", async () => {
		const { findNode } = await importModule();
		expect(findNode(TREE_FIXTURE, "div-region")?.name).toBe("North Region");
	});

	it("returns null for an id not present anywhere in the tree", async () => {
		const { findNode } = await importModule();
		expect(findNode(TREE_FIXTURE, "div-missing")).toBeNull();
	});

	it("keeps searching later siblings when the target isn't under the first one", async () => {
		const { findNode } = await importModule();
		const twoSiblings = [
			{ ...TREE_FIXTURE[0], id: "div-first", children: [] },
			{
				...TREE_FIXTURE[0],
				id: "div-second",
				children: [
					{
						id: "div-second-child",
						parentId: "div-second",
						name: "Second Child",
						children: [],
						has_children: false,
						hiddenData: {},
						path: "Second / Second Child",
						ids: "div-second,div-second-child",
					},
				],
			},
		];

		expect(findNode(twoSiblings, "div-second-child")?.name).toBe(
			"Second Child",
		);
	});
});

describe("collectParentIds / filterDivisionTree", () => {
	const leaf = (
		id: string,
		name: string,
		parentId: string,
	): DivisionTreeNode => ({
		id,
		parentId,
		name,
		children: [],
		has_children: false,
		hiddenData: {},
		path: name,
		ids: id,
	});
	const tree: DivisionTreeNode[] = [
		{
			id: "a",
			parentId: null,
			name: "Abyan",
			children: [leaf("a1", "Sibah", "a"), leaf("a2", "Zinjibar", "a")],
			has_children: true,
			hiddenData: {},
			path: "Abyan",
			ids: "a",
		},
		leaf("b", "Beta", "root"),
	];

	it("collectParentIds returns only nodes that have children", () => {
		expect(collectParentIds(tree)).toEqual(["a"]);
	});

	it("filterDivisionTree keeps case-insensitive matches with their ancestors, drops the rest", () => {
		const result = filterDivisionTree(tree, "  ZINJ ");
		expect(result.map((node) => node.id)).toEqual(["a"]);
		expect(result[0].children.map((node) => node.id)).toEqual(["a2"]);
	});

	it("filterDivisionTree returns the whole tree for a blank query and nothing for no match", () => {
		expect(filterDivisionTree(tree, " ")).toHaveLength(2);
		expect(filterDivisionTree(tree, "zzz")).toEqual([]);
	});
});
