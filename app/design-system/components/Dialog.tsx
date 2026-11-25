import type { ReactNode } from "react";
import {
	Dialog as AriaDialog,
	Heading,
	Modal,
	ModalOverlay,
} from "react-aria-components";
import { LegacyButton as Button } from "./LegacyButton";

export interface DialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	/** Caller-supplied accessible name for the header close-icon button -- not translated inside
	 * Dialog itself, matching this design system's own text-as-props convention. */
	closeLabel: string;
	children: ReactNode;
	footer?: ReactNode;
	/** `variant="item"` only: "medium" is legacy's narrower 64rem tree dialog. */
	size?: "default" | "medium";
	/** "item" reproduces legacy ContentRepeater's fixed-width "Add new item" dialog in Tailwind
	 * classes; "fullscreen" is legacy's whole-viewport Mapper; "default" keeps the existing chrome. */
	variant?: "default" | "item" | "fullscreen";
	/** Disables Escape-to-close only, keeping outside-click dismissal -- for a caller that owns
	 * a competing Escape handler of its own (e.g. a draw tool mid-draw). */
	dismissDisabled?: boolean;
}

// Wraps RAC's ModalOverlay/Modal/Dialog. isDismissable gives Escape and outside-click dismissal natively.
export function Dialog({
	isOpen,
	onOpenChange,
	title,
	closeLabel,
	children,
	footer,
	size = "default",
	variant = "default",
	dismissDisabled = false,
}: DialogProps) {
	return (
		<ModalOverlay
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			isDismissable
			isKeyboardDismissDisabled={dismissDisabled}
			className="dts-dialog-overlay"
		>
			{variant === "fullscreen" ? (
				<FullscreenPanel
					title={title}
					closeLabel={closeLabel}
					footer={footer}
					onClose={() => onOpenChange(false)}
				>
					{children}
				</FullscreenPanel>
			) : variant === "item" ? (
				<ItemPanel
					maxWidthClass={size === "medium" ? "max-w-5xl" : "max-w-6xl"}
					title={title}
					closeLabel={closeLabel}
					footer={footer}
					onClose={() => onOpenChange(false)}
				>
					{children}
				</ItemPanel>
			) : (
				<Modal className="dts-dialog-panel">
					<AriaDialog>
						<div className="dts-dialog-title">
							<Heading slot="title">{title}</Heading>
							<Button
								variant="outline"
								aria-label={closeLabel}
								onPress={() => onOpenChange(false)}
							>
								×
							</Button>
						</div>
						<div className="dts-dialog-body">{children}</div>
						{footer && <div className="dts-dialog-footer">{footer}</div>}
					</AriaDialog>
				</Modal>
			)}
		</ModalOverlay>
	);
}

// Legacy: min(92vw, 72rem), 90vw below 1199px, 95vw below 767px -- nearest Tailwind breakpoints/fractions.
// Footer classes are legacy's own.
function ItemPanel({
	maxWidthClass,
	title,
	closeLabel,
	footer,
	onClose,
	children,
}: {
	/** max-w-6xl = legacy's 72rem item dialog; max-w-5xl = its 64rem tree dialog. */
	maxWidthClass: string;
	title: string;
	closeLabel: string;
	footer?: ReactNode;
	onClose: () => void;
	children: ReactNode;
}) {
	return (
		// Flex column: header and footer stay put, the body shrinks/scrolls -- never taller than the screen.
		<Modal
			className={`flex max-h-9/10 w-11/12 ${maxWidthClass} flex-col rounded-md bg-white shadow-sm max-xl:w-9/10 max-md:w-19/20`}
		>
			<AriaDialog className="flex min-h-0 flex-1 flex-col outline-none">
				<div className="flex shrink-0 items-center justify-between p-6">
					<Heading slot="title" className="m-0 text-xl font-bold text-gray-700">
						{title}
					</Heading>
					<Button
						variant="icon"
						aria-label={closeLabel}
						onPress={onClose}
						className="size-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700"
					>
						<i className="pi pi-times" aria-hidden="true" />
					</Button>
				</div>
				<div
					className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-6 text-gray-600 ${footer ? "" : "pb-8"}`}
				>
					{children}
				</div>
				{footer && (
					<div className="mx-6 mt-5 mb-8 flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
						{footer}
					</div>
				)}
			</AriaDialog>
		</Modal>
	);
}

// Legacy Mapper: whole viewport, its own dts-dialog__header / dts-heading-2 / close-button classes.
// Padding approximates legacy's 2.29rem 1.14rem (1.71rem from 768px) on Tailwind's scale.
function FullscreenPanel({
	title,
	closeLabel,
	footer,
	onClose,
	children,
}: {
	title: string;
	closeLabel: string;
	footer?: ReactNode;
	onClose: () => void;
	children: ReactNode;
}) {
	return (
		<Modal className="fixed inset-0 flex flex-col bg-white px-4 py-8 md:px-6">
			<AriaDialog className="flex min-h-0 flex-1 flex-col outline-none">
				<div className="dts-dialog__header">
					<Heading slot="title" className="dts-heading-2 !mb-0">
						{title}
					</Heading>
					<Button
						variant="icon"
						aria-label={closeLabel}
						onPress={onClose}
						className="dts-dialog-close-button"
					>
						<i className="pi pi-times text-2xl" aria-hidden="true" />
					</Button>
				</div>
				{/* Shrinking flex column all the way down, so a child map can fill the height. */}
				<div className="flex min-h-0 flex-1 flex-col">{children}</div>
				{footer}
			</AriaDialog>
		</Modal>
	);
}
