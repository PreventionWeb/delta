import { Cell } from "react-aria-components";
import type { ReactNode } from "react";

export interface TableCellProps {
	children: ReactNode;
	/** Matches the legacy `dts-table__cell-centered` modifier. */
	centered?: boolean;
	/** Escape hatch for a caller's own structural class (e.g. legacy `dts-table__actions`). */
	className?: string;
	/** Auto-focuses this cell's interactive child when the grid cursor reaches it -- only set on a
	 * row's last interactive cell (confirmed via live trace: ArrowRight can't pass a focused child). */
	focusChild?: boolean;
}

// Matches the legacy .dts-table td rule exactly via @theme tokens (design.md Decision 8; see TableColumn).
const cellStyle = {
	borderBottom: "1px solid var(--color-dts-table-border)",
	padding: "var(--spacing-dts-cell-padding)",
	height: "var(--spacing-dts-row-height)",
};

// Thin wrapper over React Aria's unstyled `Cell`, styled to match the legacy table's `<td>`.
export function TableCell({
	children,
	centered,
	className,
	focusChild,
}: TableCellProps) {
	const classes = [centered ? "dts-table__cell-centered" : undefined, className]
		.filter(Boolean)
		.join(" ");
	return (
		<Cell
			style={cellStyle}
			className={classes || undefined}
			focusMode={focusChild ? "child" : undefined}
		>
			{children}
		</Cell>
	);
}
