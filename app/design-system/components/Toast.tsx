import {
	UNSTABLE_Toast as AriaToast,
	UNSTABLE_ToastContent as AriaToastContent,
	UNSTABLE_ToastQueue as AriaToastQueue,
	UNSTABLE_ToastRegion as AriaToastRegion,
	Text,
} from "react-aria-components";
import { CircleX, Info, X } from "lucide-react";
import { Button } from "./Button";

export interface ToastMessage {
	variant: "error" | "info";
	/** Newlines render as line breaks, so several messages can share one toast. */
	message: string;
}

export type ToastQueue = AriaToastQueue<ToastMessage>;

export function createToastQueue(): ToastQueue {
	return new AriaToastQueue<ToastMessage>();
}

// Legacy's lara-light-blue p-toast-message-error/-info, in Tailwind palette classes.
const VARIANT_CLASS = {
	error: "border-red-500 bg-red-100/70 text-red-500",
	info: "border-blue-500 bg-blue-100/70 text-blue-500",
} as const;

const VARIANT_ICON = { error: CircleX, info: Info } as const;

export interface ToastRegionProps {
	queue: ToastQueue;
	/** Accessible name of each toast's close button (text-as-props, like Dialog). */
	closeLabel: string;
}

/** Top-center stack, like legacy's PrimeReact `<Toast position="top-center">`. Renders nothing
 * while the queue is empty. */
export function ToastRegion({ queue, closeLabel }: ToastRegionProps) {
	return (
		// z-[1200]: PrimeReact's own toast layer, above dts-dialog-overlay's 1000.
		<AriaToastRegion
			queue={queue}
			className="fixed inset-x-4 top-5 z-[1200] flex flex-col items-center gap-4 outline-none"
		>
			{({ toast }) => {
				const { variant, message } = toast.content;
				const Icon = VARIANT_ICON[variant];
				return (
					<AriaToast
						toast={toast}
						data-variant={variant}
						className={`flex w-full max-w-100 items-start gap-4 rounded-md border-l-6 p-4 shadow-md ${VARIANT_CLASS[variant]}`}
					>
						<Icon aria-hidden="true" className="size-8 shrink-0" />
						<AriaToastContent className="min-w-0 flex-1 self-center">
							<Text slot="description" className="whitespace-pre-line">
								{message}
							</Text>
						</AriaToastContent>
						<Button
							variant="icon"
							slot="close"
							aria-label={closeLabel}
							className="size-8 shrink-0 items-center justify-center rounded-full hover:bg-white/50"
						>
							<X aria-hidden="true" className="size-4" />
						</Button>
					</AriaToast>
				);
			}}
		</AriaToastRegion>
	);
}
