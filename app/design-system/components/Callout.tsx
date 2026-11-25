import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";

export type CalloutTone = "success" | "error" | "info" | "warning";

export interface CalloutProps {
	tone: CalloutTone;
	title?: string;
	children: ReactNode;
	className?: string;
}

const TONE_STYLES: Record<
	CalloutTone,
	{ container: string; icon: string; Icon: typeof CheckCircle2 }
> = {
	success: {
		container: "border-good-border bg-good-bg text-fg",
		icon: "text-good",
		Icon: CheckCircle2,
	},
	error: {
		container: "border-crit-border bg-crit-bg text-crit",
		icon: "text-crit",
		Icon: AlertCircle,
	},
	info: {
		container: "border-info-border bg-info-bg text-fg",
		icon: "text-info",
		Icon: Info,
	},
	warning: {
		container: "border-warn-border bg-warn-bg text-fg",
		icon: "text-warn",
		Icon: AlertTriangle,
	},
};

export function Callout({ tone, title, children, className }: CalloutProps) {
	const { container, icon, Icon } = TONE_STYLES[tone];
	return (
		<div
			role={tone === "error" ? "alert" : "status"}
			className={[
				"flex items-start gap-3 rounded-lg border px-4 py-3 text-body",
				container,
				className,
			]
				.filter(Boolean)
				.join(" ")}
		>
			<Icon
				className={["mt-0.5 h-4 w-4 shrink-0", icon].join(" ")}
				aria-hidden="true"
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				{title ? <p className="font-medium text-fg">{title}</p> : null}
				<div className={title ? "text-fg-2" : undefined}>{children}</div>
			</div>
		</div>
	);
}
