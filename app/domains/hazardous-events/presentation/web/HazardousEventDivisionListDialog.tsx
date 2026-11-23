import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Checkbox,
	Tree,
	TreeItem,
	TreeItemContent,
	useLocale,
	type Key,
	type Selection,
} from "react-aria-components";
import { Dialog } from "~/design-system/components/Dialog";
import { Button } from "~/design-system/components/Button";
import {
	collectParentIds,
	filterDivisionTree,
	type DivisionTreeNode,
} from "./divisionTree";
import { useDivisionTree, divisionLabel } from "./useDivisionTree";

export interface HazardousEventDivisionListDialogProps {
	isOpen: boolean;
	/** Pre-checked when the dialog opens (e.g. the row being edited). */
	initialSelectedIds: readonly string[];
	/** Commits this session's checked divisions. Never called on Discard/close. */
	onApply: (ids: readonly string[]) => void;
	onDiscard: () => void;
}

// Legacy's tree toggle is font-size x-small; text-xs is Tailwind's nearest.
const TOGGLE_CLASS = "mg-button--small !inline-flex !text-xs !leading-3.5";

/** Legacy's "Select geographic level" tree: Expand/Collapse All, search, expandable levels,
 * Apply/Discard -- with checkboxes for multi-select and a fixed width so picks never widen it. */
export function HazardousEventDivisionListDialog({
	isOpen,
	initialSelectedIds,
	onApply,
	onDiscard,
}: HazardousEventDivisionListDialogProps) {
	const { t } = useTranslation("hazardous-events");
	const { direction } = useLocale();
	const state = useDivisionTree(isOpen);
	const [staged, setStaged] = useState<readonly string[]>(initialSelectedIds);
	const [expanded, setExpanded] = useState<Set<Key>>(new Set());
	const [query, setQuery] = useState("");
	const [wasOpen, setWasOpen] = useState(isOpen);

	// Each open starts from the caller's ids, collapsed and unfiltered (legacy). Reset during render
	// so no frame shows the last session; state, not a ref: StrictMode-safe.
	if (isOpen !== wasOpen) {
		setWasOpen(isOpen);
		if (isOpen) {
			setStaged(initialSelectedIds);
			setExpanded(new Set());
			setQuery("");
		}
	}

	const fullTree = state.tree;
	const visibleTree = useMemo(
		() => filterDivisionTree(fullTree, query),
		[fullTree, query],
	);
	const parentIds = useMemo(() => collectParentIds(visibleTree), [visibleTree]);
	const allExpanded = parentIds.every((id) => expanded.has(id));
	const noneExpanded = parentIds.every((id) => !expanded.has(id));

	function handleSearch(next: string) {
		setQuery(next);
		// Matches are only useful if visible -- open every level that leads to one.
		setExpanded(
			new Set(
				next.trim() ? collectParentIds(filterDivisionTree(fullTree, next)) : [],
			),
		);
	}

	// Keeps pick order (chip order) stable; hidden-by-search picks survive filtering.
	function handleSelectionChange(keys: Selection) {
		if (keys === "all") {
			return;
		}
		const next = [...keys].map(String);
		setStaged((prev) => [
			...prev.filter((id) => next.includes(id)),
			...next.filter((id) => !prev.includes(id)),
		]);
	}

	function renderNode(node: DivisionTreeNode) {
		return (
			<TreeItem
				key={node.id}
				id={node.id}
				textValue={node.name}
				className="dts-division-tree-item outline-none data-focus-visible:ring-2 data-focus-visible:ring-blue-200"
			>
				<TreeItemContent>
					{({ hasChildItems, isExpanded }) => (
						<div className="flex items-center gap-2 py-1">
							{hasChildItems ? (
								<Button
									variant="system"
									slot="chevron"
									className={TOGGLE_CLASS}
								>
									<span aria-hidden="true">
										{isExpanded ? "▼" : direction === "rtl" ? "◄" : "►"}
									</span>
								</Button>
							) : (
								// Same classes as the toggle, so leaf names line up with their siblings'.
								<span
									aria-hidden="true"
									className={`mg-button mg-button-system invisible ${TOGGLE_CLASS}`}
								>
									►
								</span>
							)}
							<Checkbox
								slot="selection"
								className="group flex cursor-pointer items-center"
							>
								<span
									aria-hidden="true"
									className="flex size-4 items-center justify-center rounded-sm border border-gray-400 bg-white text-white group-data-selected:border-blue-500 group-data-selected:bg-blue-500"
								>
									<i className="pi pi-check text-xs invisible group-data-selected:visible" />
								</span>
							</Checkbox>
							<span className="text-gray-800">{node.name}</span>
						</div>
					)}
				</TreeItemContent>
				{node.children.map(renderNode)}
			</TreeItem>
		);
	}

	return (
		<Dialog
			variant="item"
			size="medium"
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) onDiscard();
			}}
			title={t("form.spatial_footprint.division_dialog.title")}
			closeLabel={t("form.close")}
			footer={
				<>
					<Button variant="accent" onPress={() => onApply(staged)}>
						<i className="pi pi-check" aria-hidden="true" />
						{t("form.spatial_footprint.division_dialog.apply")}
					</Button>
					<Button variant="muted-outline" onPress={onDiscard}>
						<i className="pi pi-times" aria-hidden="true" />
						{t("form.spatial_footprint.division_dialog.discard")}
					</Button>
				</>
			}
		>
			<div className="mb-4 flex shrink-0 flex-wrap items-center justify-end gap-2">
				<Button
					variant="muted-outline"
					disabled={state.status !== "ready" || allExpanded}
					onPress={() => setExpanded(new Set(parentIds))}
				>
					{t("form.spatial_footprint.division_dialog.expand_all")}
				</Button>
				<Button
					variant="muted-outline"
					disabled={state.status !== "ready" || noneExpanded}
					onPress={() => setExpanded(new Set())}
				>
					{t("form.spatial_footprint.division_dialog.collapse_all")}
				</Button>
				<input
					type="search"
					value={query}
					onChange={(e) => handleSearch(e.target.value)}
					onKeyDown={(e) => {
						// Escape clears the search first; the dialog's own Escape would discard the picks.
						if (e.key === "Escape" && query !== "") {
							e.preventDefault();
							e.stopPropagation();
							handleSearch("");
						}
					}}
					placeholder={t(
						"form.spatial_footprint.division_dialog.search_placeholder",
					)}
					aria-label={t(
						"form.spatial_footprint.division_dialog.search_placeholder",
					)}
					className="min-w-0 rounded-md border border-gray-300 bg-white p-3 text-base text-gray-600 max-sm:w-full"
				/>
			</div>

			{/* Fixed height so the dialog never grows as levels expand; shrinks (to min-h-24) on short screens. */}
			<div className="h-96 min-h-24 overflow-auto border-b border-dotted border-gray-400">
				<p className="mb-4 text-gray-800">
					{t("form.spatial_footprint.division_dialog.root_caption")}
				</p>
				{state.status === "loading" && (
					<p role="status">
						{t("form.spatial_footprint.division_dialog.loading")}
					</p>
				)}
				{state.status === "error" && (
					<p role="alert">
						{t("form.spatial_footprint.division_dialog.error")}
					</p>
				)}
				{state.status === "ready" && fullTree.length === 0 && (
					<p>{t("form.spatial_footprint.division_dialog.empty")}</p>
				)}
				{state.status === "ready" &&
					fullTree.length > 0 &&
					visibleTree.length === 0 && (
						<p>{t("form.spatial_footprint.division_dialog.no_results")}</p>
					)}
				{state.status === "ready" && visibleTree.length > 0 && (
					<Tree
						aria-label={t("form.spatial_footprint.division_dialog.title")}
						selectionMode="multiple"
						selectionBehavior="toggle"
						selectedKeys={new Set(staged)}
						onSelectionChange={handleSelectionChange}
						expandedKeys={expanded}
						onExpandedChange={setExpanded}
					>
						{visibleTree.map(renderNode)}
					</Tree>
				)}
			</div>

			{/* Wraps inside the fixed width and scrolls past a few lines -- never widens the dialog. */}
			<div className="shrink-0 pt-4">
				<p className="mb-2 font-bold text-gray-800">
					{t("form.spatial_footprint.division_dialog.selected_caption")}
				</p>
				<div className="flex max-h-24 min-h-10 flex-wrap content-start gap-1 overflow-y-auto">
					{staged.map((id) => {
						const label = divisionLabel(fullTree, id, t);
						return (
							<span
								key={id}
								className="inline-flex items-center gap-2 rounded-sm border border-gray-300 bg-gray-100 px-2 py-1 text-gray-800"
							>
								{label}
								<button
									type="button"
									className="cursor-pointer"
									aria-label={t(
										"form.spatial_footprint.division_dialog.remove",
										{
											name: label,
											// React escapes already; i18next would turn "/" into &#x2F;.
											interpolation: { escapeValue: false },
										},
									)}
									onClick={() =>
										setStaged((prev) => prev.filter((other) => other !== id))
									}
								>
									<i className="pi pi-times text-xs" aria-hidden="true" />
								</button>
							</span>
						);
					})}
				</div>
			</div>
		</Dialog>
	);
}
