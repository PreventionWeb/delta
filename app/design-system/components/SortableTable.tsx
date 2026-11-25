import type { ReactNode } from "react";
import {
	Cell,
	Column,
	Row,
	Table,
	TableBody,
	TableHeader,
	type SortDescriptor as AriaSortDescriptor,
} from "react-aria-components";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

export type SortDescriptor = {
	column: string;
	direction: "ascending" | "descending";
};

export interface SortableColumnDef {
	id: string;
	label: string;
	sortable?: boolean;
	isRowHeader?: boolean;
	srOnly?: boolean;
	align?: "left" | "right";
}

export interface SortableTableProps<T extends { id: string }> {
	"aria-label": string;
	columns: SortableColumnDef[];
	items: T[];
	sortDescriptor?: SortDescriptor;
	onSortChange?: (descriptor: SortDescriptor) => void;
	renderRow: (item: T) => ReactNode[];
	renderEmptyState: () => ReactNode;
}

export function SortableTable<T extends { id: string }>({
	"aria-label": ariaLabel,
	columns,
	items,
	sortDescriptor,
	onSortChange,
	renderRow,
	renderEmptyState,
}: SortableTableProps<T>) {
	const handleSortChange = (next: AriaSortDescriptor) => {
		if (!onSortChange || next.column === undefined) return;
		onSortChange({
			column: String(next.column),
			direction: next.direction ?? "ascending",
		});
	};

	return (
		<div className="overflow-x-auto">
			<Table
				aria-label={ariaLabel}
				selectionMode="none"
				keyboardNavigationBehavior="tab"
				sortDescriptor={sortDescriptor}
				onSortChange={handleSortChange}
				className="w-full border-collapse text-left"
			>
				<TableHeader className="sticky top-0 border-b border-border bg-surface">
					{columns.map((col) => (
						<Column
							key={col.id}
							id={col.id}
							isRowHeader={col.isRowHeader}
							allowsSorting={Boolean(col.sortable)}
							className={[
								"h-10 px-4 text-label font-medium text-fg-2 whitespace-nowrap outline-none",
								"data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-[-2px] data-[focus-visible]:outline-[var(--focus-ring)]",
								col.sortable
									? "cursor-pointer select-none data-[hovered]:text-fg"
									: "",
								col.align === "right" ? "text-right" : "text-left",
							]
								.filter(Boolean)
								.join(" ")}
						>
							{({ sortDirection }) =>
								col.srOnly ? (
									<span className="sr-only">{col.label}</span>
								) : (
									<span
										className={[
											"inline-flex items-center gap-1",
											col.align === "right" ? "justify-end" : "",
										]
											.filter(Boolean)
											.join(" ")}
									>
										<span>{col.label}</span>
										{col.sortable ? (
											sortDirection === "ascending" ? (
												<ArrowUp
													className="h-3 w-3 shrink-0 text-fg"
													aria-hidden="true"
												/>
											) : sortDirection === "descending" ? (
												<ArrowDown
													className="h-3 w-3 shrink-0 text-fg"
													aria-hidden="true"
												/>
											) : (
												<ChevronsUpDown
													className="h-3 w-3 shrink-0 text-fg-3"
													aria-hidden="true"
												/>
											)
										) : null}
									</span>
								)
							}
						</Column>
					))}
				</TableHeader>
				<TableBody items={items} renderEmptyState={renderEmptyState}>
					{(item) => {
						const cells = renderRow(item);
						return (
							<Row
								id={item.id}
								className="border-b border-border-subtle last:border-b-0 outline-none"
							>
								{columns.map((col, idx) => (
									<Cell
										key={col.id}
										className={[
											"h-10 px-4 text-body text-fg align-middle outline-none",
											"data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-[-2px] data-[focus-visible]:outline-[var(--focus-ring)]",
											col.align === "right" ? "text-right" : "text-left",
										].join(" ")}
									>
										{cells[idx]}
									</Cell>
								))}
							</Row>
						);
					}}
				</TableBody>
			</Table>
		</div>
	);
}
