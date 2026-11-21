export interface DivisionTreeNode {
	id: string;
	parentId: string | null;
	name: string;
	children: DivisionTreeNode[];
	has_children: boolean;
	hiddenData: Record<string, string>;
	path: string;
	ids: string;
}

/** One shared request per URL, cleared on failure; keyed by URL since it carries the language. */
const treePromises = new Map<string, Promise<readonly DivisionTreeNode[]>>();
const resolvedTrees = new Map<string, readonly DivisionTreeNode[]>();
const treeListeners = new Set<() => void>();

/** Notifies when any tree resolves, so readers that errored or waited pick it up. */
export function subscribeDivisionTree(listener: () => void): () => void {
	treeListeners.add(listener);
	return () => {
		treeListeners.delete(listener);
	};
}

/** The tree for `url` if a fetch already resolved, so a new reader can skip a loading frame. */
export function cachedDivisionTree(
	url: string,
): readonly DivisionTreeNode[] | null {
	return resolvedTrees.get(url) ?? null;
}

/** `url` is the caller's own lang-prefixed path, e.g. "/en/api/division/tree". */
export function fetchDivisionTree(
	url: string,
): Promise<readonly DivisionTreeNode[]> {
	const cached = treePromises.get(url);
	if (cached) {
		return cached;
	}
	const promise = fetch(url, { method: "GET" })
		.then((response) => {
			if (!response.ok) {
				throw new Error("Failed to load division tree");
			}
			return response.json();
		})
		.then((tree: readonly DivisionTreeNode[]) => {
			resolvedTrees.set(url, tree);
			treeListeners.forEach((listener) => listener());
			return tree;
		})
		.catch((err) => {
			treePromises.delete(url);
			throw err;
		});
	treePromises.set(url, promise);
	return promise;
}

export function findNode(
	nodes: readonly DivisionTreeNode[],
	id: string,
): DivisionTreeNode | null {
	for (const node of nodes) {
		if (node.id === id) {
			return node;
		}
		const found = findNode(node.children, id);
		if (found) {
			return found;
		}
	}
	return null;
}

/** Ids of nodes that have children -- the ones Expand All/Collapse All act on. */
export function collectParentIds(nodes: readonly DivisionTreeNode[]): string[] {
	return nodes.flatMap((node) =>
		node.children.length > 0
			? [node.id, ...collectParentIds(node.children)]
			: [],
	);
}

/** Case-insensitive name match; keeps each match's ancestors so its path stays visible. */
export function filterDivisionTree(
	nodes: readonly DivisionTreeNode[],
	query: string,
): DivisionTreeNode[] {
	const needle = query.trim().toLowerCase();
	if (needle === "") {
		return [...nodes];
	}
	return nodes.flatMap((node) => {
		const children = filterDivisionTree(node.children, needle);
		return node.name.toLowerCase().includes(needle) || children.length > 0
			? [{ ...node, children }]
			: [];
	});
}
