import { useMemo, useState } from "react";
import { useLoaderData, useNavigate, useOutletContext } from "react-router";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import { Tree } from "primereact/tree";
import type { TreeProps } from "primereact/tree";
import type { TreeNode } from "primereact/treenode";
import { getAllDivisionsByCountryAccountsId } from "~/backend.server/models/division";
import { buildTree } from "~/components/TreeView";
import type {
	DisasterEventFormOutletContext,
	SelectedDivisionItem,
} from "~/frontend/disaster-event/DisasterEventForm";
import { authLoaderWithPerm } from "~/utils/auth";
import { getCountryAccountsIdFromSession } from "~/utils/session";

type DivisionTreeNodeInput = {
	id: string | number;
	name: string;
	children?: DivisionTreeNodeInput[];
};

function toPrimeTreeNodes(nodes: DivisionTreeNodeInput[]): TreeNode[] {
	return nodes.map((node) => ({
		key: String(node.id),
		label: node.name,
		data: { id: node.id },
		children: toPrimeTreeNodes(node.children || []),
	}));
}

function filterTreeNodes(nodes: TreeNode[], query: string): TreeNode[] {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) {
		return nodes;
	}

	return nodes.reduce<TreeNode[]>((accumulator, node) => {
		const label = String(node.label || "").toLowerCase();
		const filteredChildren = node.children
			? filterTreeNodes(node.children, normalizedQuery)
			: [];
		const matchesNode = label.includes(normalizedQuery);

		if (matchesNode || filteredChildren.length > 0) {
			accumulator.push({
				...node,
				children: filteredChildren,
			});
		}

		return accumulator;
	}, []);
}

function getTopLevelSelectedKeys(
	nodes: TreeNode[],
	selectionKeys: TreeProps["selectionKeys"],
): string[] {
	if (!selectionKeys || typeof selectionKeys !== "object") {
		return [];
	}

	const checkedKeys = new Set(
		Object.entries(selectionKeys)
			.filter(([, value]) => {
				if (value === true) {
					return true;
				}
				if (typeof value === "object" && value !== null) {
					return "checked" in value && value.checked === true;
				}
				return false;
			})
			.map(([key]) => key),
	);

	const result: string[] = [];
	const visit = (treeNodes: TreeNode[], parentChecked: boolean) => {
		for (const node of treeNodes) {
			const key = node.key == null ? null : String(node.key);
			const isChecked = key ? checkedKeys.has(key) : false;

			if (isChecked && !parentChecked && key) {
				result.push(key);
			}

			if (node.children?.length) {
				visit(node.children, parentChecked || isChecked);
			}
		}
	};

	visit(nodes, false);
	return result;
}

function buildInitialSelectionKeys(
	nodes: TreeNode[],
	selectedItems: SelectedDivisionItem[],
): Record<string, { checked: boolean; partialChecked: boolean }> {
	const parentByKey = new Map<string, string | null>();
	const visit = (treeNodes: TreeNode[], parentKey: string | null) => {
		for (const node of treeNodes) {
			if (node.key == null) {
				continue;
			}

			const nodeKey = String(node.key);
			parentByKey.set(nodeKey, parentKey);
			if (node.children?.length) {
				visit(node.children, nodeKey);
			}
		}
	};

	visit(nodes, null);

	const result: Record<string, { checked: boolean; partialChecked: boolean }> =
		{};

	for (const item of selectedItems) {
		result[item.key] = { checked: true, partialChecked: false };
	}

	for (const item of selectedItems) {
		let parentKey = parentByKey.get(item.key) ?? null;
		while (parentKey) {
			const parentState = result[parentKey];
			if (!parentState || !parentState.checked) {
				result[parentKey] = { checked: false, partialChecked: true };
			}
			parentKey = parentByKey.get(parentKey) ?? null;
		}
	}

	return result;
}

export const loader = authLoaderWithPerm("EditData", async ({ request }) => {
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const divisions = await getAllDivisionsByCountryAccountsId(countryAccountsId);
	const treeData = buildTree(divisions, "id", "parentId", "name", "en");

	return {
		treeData,
	};
});

export default function AffectedAreasModalRoute() {
	const ld = useLoaderData<typeof loader>();
	const navigate = useNavigate();
	const { selectedDivisionItems, setSelectedDivisionItems } =
		useOutletContext<DisasterEventFormOutletContext>();

	const nodes = useMemo(
		() => toPrimeTreeNodes(ld.treeData as DivisionTreeNodeInput[]),
		[ld.treeData],
	);
	const labelByKey = useMemo(() => {
		const map = new Map<string, string>();
		const walk = (treeNodes: TreeNode[]) => {
			for (const node of treeNodes) {
				if (node.key != null) {
					map.set(String(node.key), String(node.label || node.key));
				}
				if (node.children?.length) {
					walk(node.children);
				}
			}
		};

		walk(nodes);
		return map;
	}, [nodes]);

	const [searchTerm, setSearchTerm] = useState("");
	const [selectionKeys, setSelectionKeys] = useState<TreeProps["selectionKeys"]>(
		() => buildInitialSelectionKeys(nodes, selectedDivisionItems),
	);
	const filteredNodes = useMemo(
		() => filterTreeNodes(nodes, searchTerm),
		[nodes, searchTerm],
	);

	const selectedCount = useMemo(() => {
		const keys = getTopLevelSelectedKeys(nodes, selectionKeys);
		return keys.length;
	}, [nodes, selectionKeys]);

	const handleSave = () => {
		const keys = getTopLevelSelectedKeys(nodes, selectionKeys);
		const nextItems: SelectedDivisionItem[] = keys.map((key) => ({
			key,
			label: labelByKey.get(key) ?? key,
		}));

		setSelectedDivisionItems(nextItems);
		navigate("..", { replace: true });
	};

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 40,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "rgba(0, 0, 0, 0.35)",
				padding: "1rem",
			}}
		>
			<div className="w-full max-w-4xl rounded-xl bg-white p-5 shadow-xl">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="text-[18px] font-semibold text-slate-800">
						Select geographic levels
					</h3>
					<Button
						type="button"
						label="Close"
						text
						onClick={() => navigate("..", { replace: true })}
					/>
				</div>

				<p className="mb-4 text-[13px] text-slate-500">
					Select one or more geographic levels from the hierarchical tree below.
				</p>
				<div className="mb-3 relative">
					<i className="pi pi-search pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
					<InputText
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
						placeholder="Search locations..."
						className="w-full pr-10"
					/>
				</div>
				<div className="mb-3 flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-slate-700">
					<div>
						{selectedCount} location{selectedCount === 1 ? " selected" : "s selected"}
					</div>
					<Button
						type="button"
						label="Clear all"
						text
						size="small"
						onClick={() => setSelectionKeys(null)}
					/>
				</div>
				<div className="max-h-[26rem] overflow-auto rounded-md border border-slate-200 bg-white p-3 shadow-sm">
					<Tree
						value={filteredNodes}
						selectionMode="checkbox"
						selectionKeys={selectionKeys}
						onSelectionChange={(event) => setSelectionKeys(event.value)}
						className="w-full"
					/>
				</div>

				<div className="mt-4 flex justify-end gap-2">
					<Button
						type="button"
						label="Cancel"
						outlined
						onClick={() => navigate("..", { replace: true })}
					/>
					<Button type="button" label="Apply" onClick={handleSave} />
				</div>
			</div>
		</div>
	);
}
