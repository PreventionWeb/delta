import { Column } from "react-aria-components";
import type { ReactNode } from "react";

export interface TableColumnProps {
	id: string;
	children: ReactNode;
	/** Centers the header cell — matches the legacy `dts-table__cell-centered` modifier, used by
	 * the legacy Actions column header. */
	centered?: boolean;
	/** Announced by assistive technology during row navigation (one column per table, typically
	 * the first/identifying one). */
	isRowHeader?: boolean;
}

// Matches the legacy .dts-table th rule exactly, via the @theme tokens rather than literal
// hex/rem values (design.md Decision 8).
const headerCellStyle = {
	backgroundColor: "var(--color-dts-table-header-bg)",
	borderBottom: "1px solid var(--color-dts-table-border)",
	padding: "var(--spacing-dts-cell-padding)",
	height: "var(--spacing-dts-row-height)",
};

// Thin wrapper over React Aria's unstyled `Column`, styled to match the legacy table's `<th>`.
export function TableColumn({
	id,
	children,
	centered,
	isRowHeader,
}: TableColumnProps) {
	return (
		<Column
			id={id}
			isRowHeader={isRowHeader}
			style={headerCellStyle}
			className={centered ? "dts-table__cell-centered" : undefined}
		>
			{children}
		</Column>
	);
}
