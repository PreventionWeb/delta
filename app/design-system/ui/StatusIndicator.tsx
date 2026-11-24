import type { ReactNode } from "react";

export type StatusTone =
	| "positive"
	| "warning"
	| "critical"
	| "info"
	| "neutral";

export interface StatusIndicatorProps {
	tone: StatusTone;
	children: ReactNode;
}

const DOT_CLASSES: Record<StatusTone, string> = {
	positive: "bg-good",
	warning: "bg-warn",
	critical: "bg-crit",
	info: "bg-info",
	neutral: "bg-fg-3",
};

export function StatusIndicator({ tone, children }: StatusIndicatorProps) {
	return (
		<span className="inline-flex items-center gap-2 text-body text-fg whitespace-nowrap">
			<span
				aria-hidden="true"
				className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT_CLASSES[tone]}`}
			/>
			<span>{children}</span>
		</span>
	);
}
