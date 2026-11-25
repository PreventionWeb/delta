import type { ReactNode } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { X } from "lucide-react";
import { Button } from "./Button";

export interface ModalDialogProps {
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	title: string;
	role?: "dialog" | "alertdialog";
	size?: "md" | "lg";
	closeLabel?: string;
	children: ReactNode;
	footer?: ReactNode;
}

export function ModalDialog({
	isOpen,
	onOpenChange,
	title,
	role = "dialog",
	size = "md",
	closeLabel = "Close",
	children,
	footer,
}: ModalDialogProps) {
	return (
		<ModalOverlay
			data-testid="modal-overlay"
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			isDismissable={false}
			isKeyboardDismissDisabled={false}
			className="ds-scope fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
		>
			<Modal
				isDismissable={false}
				isKeyboardDismissDisabled={false}
				className={[
					"w-full rounded-xl border border-border bg-surface shadow-lg outline-none max-h-[90vh] flex flex-col",
					size === "lg" ? "max-w-[640px]" : "max-w-[480px]",
				].join(" ")}
			>
				<Dialog
					role={role}
					className="flex flex-col outline-none overflow-y-auto"
				>
					{({ close }) => (
						<>
							<div className="flex items-start justify-between gap-4 p-6">
								<Heading
									slot="title"
									className="text-section font-medium leading-[var(--lh-tight)] text-fg"
								>
									{title}
								</Heading>
								<Button variant="icon" aria-label={closeLabel} onPress={close}>
									<X className="h-4 w-4" aria-hidden="true" />
								</Button>
							</div>
							<div className="flex flex-col gap-6 px-6 pb-6 text-body text-fg-2">
								{children}
							</div>
							{footer ? (
								<div className="flex items-center justify-end gap-2 border-t border-border-subtle p-6">
									{footer}
								</div>
							) : null}
						</>
					)}
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}
