export interface SectorRow {
	id: string;
	name: string;
	description: string | null;
	level: number;
	parentId: string | null;
}

export interface SectorTreeNode {
	id: string;
	name: string;
	description: string | null;
	level: number;
	children?: SectorTreeNode[];
}

function sortTreeByLocalizedName(
	nodes: SectorTreeNode[],
	locale?: string,
	visited: Set<string> = new Set(),
): SectorTreeNode[] {
	nodes.sort((a, b) =>
		a.name.localeCompare(b.name, locale, { sensitivity: "base" }),
	);
	for (const node of nodes) {
		if (visited.has(node.id)) continue;
		visited.add(node.id);
		if (node.children?.length) {
			sortTreeByLocalizedName(node.children, locale, visited);
		}
	}
	return nodes;
}

function createsCycle(
	childId: string,
	parentId: string,
	parentById: ReadonlyMap<string, string | null>,
): boolean {
	let current: string | null | undefined = parentId;
	const seen = new Set<string>([childId]);
	while (current) {
		if (seen.has(current)) return true;
		seen.add(current);
		current = parentById.get(current);
	}
	return false;
}

/**
 * Builds a sector hierarchy from flat rows, sorting siblings alphabetically
 * by localized name. Rows with missing or cyclic parentId links are promoted
 * to root so catalog data is never silently dropped or infinitely recursed.
 */
export function buildSectorTree(
	rows: readonly SectorRow[],
	locale?: string,
): SectorTreeNode[] {
	const map = new Map<string, SectorTreeNode>();
	const parentById = new Map<string, string | null>();
	const roots: SectorTreeNode[] = [];

	for (const row of rows) {
		map.set(row.id, {
			id: row.id,
			name: row.name,
			description: row.description,
			level: row.level,
		});
		parentById.set(row.id, row.parentId);
	}

	for (const row of rows) {
		const node = map.get(row.id);
		if (!node) continue;

		const parent =
			row.parentId &&
			row.parentId !== row.id &&
			!createsCycle(row.id, row.parentId, parentById)
				? map.get(row.parentId)
				: undefined;

		if (parent) {
			if (!parent.children) {
				parent.children = [];
			}
			parent.children.push(node);
		} else {
			roots.push(node);
		}
	}

	return sortTreeByLocalizedName(roots, locale);
}

/** Collects IDs of all nodes that have at least one child. */
export function collectBranchIds<
	T extends { id: string; children?: readonly T[] },
>(nodes: readonly T[], out: string[] = []): string[] {
	for (const node of nodes) {
		if (node.children?.length) {
			out.push(node.id);
			collectBranchIds(node.children, out);
		}
	}
	return out;
}

/**
 * Filters a sector tree by case-insensitive substring match on name only.
 * If a parent matches and none of its children match, all of its children are
 * retained so users can browse the full subtree under a matching sector.
 */
export function filterSectorTree(
	nodes: readonly SectorTreeNode[],
	query: string,
): readonly SectorTreeNode[] {
	const trimmed = query.trim();
	if (!trimmed) {
		return nodes;
	}

	const q = trimmed.toLowerCase();
	const out: SectorTreeNode[] = [];

	for (const node of nodes) {
		const matchedChildren = node.children?.length
			? filterSectorTree(node.children, trimmed)
			: [];
		const selfMatches = node.name.toLowerCase().includes(q);

		if (selfMatches || matchedChildren.length > 0) {
			const children =
				selfMatches && matchedChildren.length === 0
					? node.children
					: matchedChildren.length > 0
						? [...matchedChildren]
						: undefined;
			out.push(
				children ? { ...node, children } : { ...node, children: undefined },
			);
		}
	}

	return out;
}

/** Counts every node across all levels of a tree. */
export function countTreeNodes<T extends { children?: readonly T[] }>(
	nodes: readonly T[],
): number {
	let total = 0;
	for (const node of nodes) {
		total += 1;
		if (node.children?.length) {
			total += countTreeNodes(node.children);
		}
	}
	return total;
}
