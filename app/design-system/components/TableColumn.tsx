import { Column } from "react-aria-components";
import type { ReactNode } from "react";

export interface TableColumnProps {
	id: string;
	children: ReactNode;
	/** Centers the header cell — matches the legacy `dts-table__cell-centered` modifier. */
	centered?: boolean;
	/** Announced by assistive technology during row navigation (one column per table, typically
	 * the first/identifying one). */
	isRowHeader?: boolean;
	/** Opts out of the fixed row height below, sizing to content instead. */
	compact?: boolean;
	/** Style object, not a className -- same mechanism as TableCell's own `padding` (design.md Decision 15, Fix 7). */
	padding?: "token" | "cozy";
	/** Caller's own width/alignment utilities (e.g. legacy ContentRepeater's right-aligned Action column). */
	className?: string;
}

// Matches the legacy .dts-table th rule exactly, via @theme tokens, not literal values (design.md Decision 8).
const headerCellStyle = {
	backgroundColor: "var(--color-dts-table-header-bg)",
	borderBottom: "1px solid var(--color-dts-table-border)",
	padding: "var(--spacing-dts-cell-padding)",
	height: "var(--spacing-dts-row-height)",
};

const compactHeaderCellStyle = { ...headerCellStyle, height: "auto" };

const cozyHeaderCellStyle = {
	...headerCellStyle,
	padding: "0.5rem 0.75rem",
	height: "auto",
};

// Thin wrapper over React Aria's unstyled `Column`, styled to match the legacy table's `<th>`.
export function TableColumn({
	id,
	children,
	centered,
	isRowHeader,
	compact,
	padding = "token",
	className,
}: TableColumnProps) {
	const style =
		padding === "cozy"
			? cozyHeaderCellStyle
			: compact
				? compactHeaderCellStyle
				: headerCellStyle;
	return (
		<Column
			id={id}
			isRowHeader={isRowHeader}
			style={style}
			className={
				[centered ? "dts-table__cell-centered" : undefined, className]
					.filter(Boolean)
					.join(" ") || undefined
			}
		>
			{children}
		</Column>
	);
}
