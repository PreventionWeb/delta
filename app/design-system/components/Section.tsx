import type { ReactNode } from "react";
// Legacy ContentRepeater's own stylesheet -- imported here so the chrome never depends on a sibling.
import "~/components/ContentRepeater/assets/content-repeater.css";

export interface SectionProps {
	title: string;
	children: ReactNode;
	/** Rendered below `children`, in its own row -- not beside the title. */
	actions: ReactNode;
}

/** Grey-card chrome only, via legacy ContentRepeater's own classes -- no knowledge of `children`/`actions`. */
export function Section({ title, children, actions }: SectionProps) {
	return (
		<div className="content-repeater">
			<div className="content-repeater-caption">{title}</div>
			{children}
			<div className="content-repeater-actions">{actions}</div>
		</div>
	);
}
