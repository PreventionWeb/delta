import {
	Table as AriaTable,
	TableHeader as AriaTableHeader,
	TableBody as AriaTableBody,
} from "react-aria-components";
import type { ReactNode } from "react";

export interface TableProps {
	"aria-label": string;
	/** The `TableColumn` elements that make up the header row. */
	header: ReactNode;
	/** The `TableRow` elements that make up the body. */
	children: ReactNode;
	/** Rendered when `children` is empty; omit for legacy's bare header-only table. */
	emptyState?: ReactNode;
	className?: string;
}

// dts-table class + selectionMode="none" match legacy's plain <table> (design.md Decision 7).
// Library-inherent, non-overridable: role="grid" not legacy's implicit "table", and keyboard reach
// is Tab-into-row + ArrowRight-across-cells, not legacy's per-element Tab (see TableCell.focusMode).
export function Table({
	"aria-label": ariaLabel,
	header,
	children,
	emptyState,
	className,
}: TableProps) {
	return (
		<AriaTable
			aria-label={ariaLabel}
			selectionMode="none"
			keyboardNavigationBehavior="tab"
			className={["dts-table", className].filter(Boolean).join(" ")}
		>
			<AriaTableHeader>{header}</AriaTableHeader>
			{/* Omitted when absent -- RAC renders an empty row otherwise (legacy has none). */}
			<AriaTableBody
				renderEmptyState={emptyState ? () => emptyState : undefined}
			>
				{children}
			</AriaTableBody>
		</AriaTable>
	);
}
