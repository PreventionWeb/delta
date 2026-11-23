import type { ReactNode } from "react";
import {
	Dialog as AriaDialog,
	Heading,
	Modal,
	ModalOverlay,
} from "react-aria-components";
import { X } from "lucide-react";
import { Button } from "./Button";

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
	 * classes; "confirm" is legacy's 32rem PrimeReact ConfirmDialog; "fullscreen" is legacy's
	 * whole-viewport Mapper; "default" keeps the existing chrome. */
	variant?: "default" | "item" | "confirm" | "fullscreen";
	/** Disables Escape-to-close only, keeping outside-click dismissal -- for a caller that owns
	 * a competing Escape handler of its own (e.g. a draw tool mid-draw). */
	dismissDisabled?: boolean;
	/** Disables outside-click dismissal only, keeping Escape -- legacy's confirm dialogs ignore
	 * overlay clicks. */
	outsideClickDismissDisabled?: boolean;
}

// Wraps RAC's ModalOverlay/Modal/Dialog. Escape and outside-click dismissal are native; each has its own opt-out prop.
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
	outsideClickDismissDisabled = false,
}: DialogProps) {
	return (
		<ModalOverlay
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			isDismissable={!outsideClickDismissDisabled}
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
			) : variant === "confirm" ? (
				<ConfirmPanel
					title={title}
					closeLabel={closeLabel}
					footer={footer}
					onClose={() => onOpenChange(false)}
				>
					{children}
				</ConfirmPanel>
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

// Legacy lara .p-dialog/.p-confirm-dialog chrome (theme.css:4890-4966): 32rem wide, 1.5rem
// padding, bold 1.25rem gray-700 title, round gray close, message indented 1rem.
function ConfirmPanel({
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
		<Modal className="max-h-9/10 w-lg max-w-full overflow-y-auto rounded-md bg-white shadow-sm">
			<AriaDialog className="outline-none">
				<div className="flex items-center justify-between p-6">
					<Heading slot="title" className="m-0 text-xl font-bold text-gray-700">
						{title}
					</Heading>
					<Button
						variant="icon"
						aria-label={closeLabel}
						onPress={onClose}
						className="size-8 shrink-0 items-center justify-center self-start rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700"
					>
						{/* size-6: lucide's cross spans half its box, so this matches PrimeReact's ~11px TimesIcon. */}
						<X aria-hidden="true" className="size-6" />
					</Button>
				</div>
				<div className="pr-6 pb-8 pl-10 text-gray-600">{children}</div>
				{/* gap-4/pr-8: legacy's gap-2 plus lara's 0.5rem right margin on each footer button. */}
				{footer && (
					<div className="flex flex-wrap items-center justify-end gap-4 pr-8 pb-6 pl-6">
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
