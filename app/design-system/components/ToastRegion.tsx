import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { Button } from "./Button";

export interface ToastItem {
	id: string;
	message: string;
	tone: "success" | "error";
}

export interface ToastRegionProps {
	toasts: ToastItem[];
	onDismiss: (id: string) => void;
	dismissLabel?: string;
}

export function ToastRegion({
	toasts,
	onDismiss,
	dismissLabel = "Dismiss notification",
}: ToastRegionProps) {
	if (toasts.length === 0) return null;

	return (
		<div
			aria-live="polite"
			className="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-32px)] flex-col gap-2"
		>
			{toasts.slice(-3).map((toast) => (
				<div
					key={toast.id}
					role={toast.tone === "error" ? "alert" : "status"}
					className="flex items-start gap-3 rounded-lg bg-toast px-4 py-3 text-body text-fg-inverse shadow-lg"
				>
					{toast.tone === "success" ? (
						<CheckCircle2
							className="h-4 w-4 shrink-0 text-good-on-dark"
							aria-hidden="true"
						/>
					) : (
						<AlertCircle
							className="h-4 w-4 shrink-0 text-crit-border"
							aria-hidden="true"
						/>
					)}
					<span className="flex-1 leading-[var(--lh-normal)]">
						{toast.message}
					</span>
					<Button
						variant="icon"
						aria-label={dismissLabel}
						onPress={() => onDismiss(toast.id)}
						className="text-fg-inverse data-[hovered]:bg-surface/15 data-[hovered]:text-fg-inverse"
					>
						<X className="h-4 w-4" aria-hidden="true" />
					</Button>
				</div>
			))}
		</div>
	);
}
