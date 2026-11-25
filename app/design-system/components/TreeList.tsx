import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import {
	Button as AriaButton,
	Tree,
	TreeItem,
	TreeItemContent,
} from "react-aria-components";

const BASE_INDENT_PX = 8;
const LEVEL_INDENT_PX = 24;

export interface TreeListNode {
	id: string;
	name: string;
	children?: readonly TreeListNode[];
}

export interface TreeListProps<
	T extends { id: string; name: string; children?: readonly T[] },
> {
	ariaLabel: string;
	nodes: readonly T[];
	expandedKeys: ReadonlySet<string>;
	onExpandedChange: (keys: Set<string>) => void;
	emptyMessage: string;
	renderMain: (node: T, level: number) => ReactNode;
	renderActions?: (node: T, level: number) => ReactNode;
}

interface TreeListBranchProps<
	T extends { id: string; name: string; children?: readonly T[] },
> {
	node: T;
	onToggle: (id: string) => void;
	renderMain: (node: T, level: number) => ReactNode;
	renderActions?: (node: T, level: number) => ReactNode;
}

function TreeListBranch<
	T extends { id: string; name: string; children?: readonly T[] },
>({ node, onToggle, renderMain, renderActions }: TreeListBranchProps<T>) {
	const hasChildren = Boolean(node.children?.length);

	return (
		<TreeItem
			id={node.id}
			textValue={node.name}
			onAction={hasChildren ? () => onToggle(node.id) : undefined}
			className="group block outline-none data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-accent"
		>
			<TreeItemContent>
				{({ hasChildItems, isExpanded, level }) => (
					<div
						data-tree-row=""
						data-branch={hasChildItems ? "" : undefined}
						style={{
							paddingInlineStart:
								BASE_INDENT_PX + (level - 1) * LEVEL_INDENT_PX,
						}}
						className={[
							"flex min-h-[40px] items-center gap-[8px] pr-[16px] transition-colors duration-[var(--dur-fast)]",
							hasChildItems
								? "cursor-pointer group-data-[hovered]:bg-inset"
								: "",
						]
							.filter(Boolean)
							.join(" ")}
					>
						{hasChildItems ? (
							<AriaButton
								slot="chevron"
								className="inline-flex h-[24px] w-[24px] flex-none items-center justify-center rounded-md border-0 bg-transparent text-fg-2 outline-none data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-1 data-[focus-visible]:outline-accent"
							>
								<ChevronRight
									className="h-[16px] w-[16px] flex-none transition-transform duration-[var(--dur-fast)]"
									style={{
										transform: isExpanded ? "rotate(90deg)" : "none",
									}}
									aria-hidden="true"
								/>
							</AriaButton>
						) : (
							<span
								className="inline-flex h-[24px] w-[24px] flex-none"
								aria-hidden="true"
							/>
						)}
						{renderMain(node, level)}
						{renderActions ? (
							<span className="flex flex-none gap-[4px]">
								{renderActions(node, level)}
							</span>
						) : null}
					</div>
				)}
			</TreeItemContent>
			{node.children?.map((child) => (
				<TreeListBranch
					key={child.id}
					node={child}
					onToggle={onToggle}
					renderMain={renderMain}
					renderActions={renderActions}
				/>
			))}
		</TreeItem>
	);
}

/**
 * Reusable accessible hierarchical tree list built on React Aria Tree.
 * Shared across read-only (Sectors) and editable (Geographic levels) screens.
 */
export function TreeList<
	T extends { id: string; name: string; children?: readonly T[] },
>({
	ariaLabel,
	nodes,
	expandedKeys,
	onExpandedChange,
	emptyMessage,
	renderMain,
	renderActions,
}: TreeListProps<T>) {
	const handleToggle = (id: string) => {
		const next = new Set(expandedKeys);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		onExpandedChange(next);
	};

	return (
		<Tree
			aria-label={ariaLabel}
			selectionMode="none"
			expandedKeys={expandedKeys}
			onExpandedChange={(keys) =>
				onExpandedChange(new Set(Array.from(keys, String)))
			}
			className="outline-none [&_[role=row]+[role=row]_[data-tree-row]]:border-t [&_[role=row]+[role=row]_[data-tree-row]]:border-border-subtle"
			renderEmptyState={() => (
				<div className="p-6 text-body text-fg-2">{emptyMessage}</div>
			)}
		>
			{nodes.map((node) => (
				<TreeListBranch
					key={node.id}
					node={node}
					onToggle={handleToggle}
					renderMain={renderMain}
					renderActions={renderActions}
				/>
			))}
		</Tree>
	);
}
