import { Row } from "react-aria-components";
import type { ReactNode } from "react";

export interface TableRowProps {
	id: string;
	children: ReactNode;
}

/** Thin wrapper over React Aria's unstyled `Row` — a `<tr>`, no selection/action behavior
 * attached (the containing `Table` disables selection; row navigation is a `Link` in a cell). */
export function TableRow({ id, children }: TableRowProps) {
	return <Row id={id}>{children}</Row>;
}
