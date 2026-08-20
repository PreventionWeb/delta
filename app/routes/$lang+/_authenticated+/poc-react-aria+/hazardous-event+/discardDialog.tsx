// Rebuild of the discard/exit-confirmation dialog (task 3.8, openspec/changes/
// poc-react-aria-hazardous-event; design.md Decision 3's "Discard/exit-confirmation dialog" row)
// using React Aria `Modal`/`Dialog` + `Button`. Confirmed inline/local to
// `app/frontend/events/hazardeventform.tsx` (not a shared component, unlike `SaveSubmitDialog`) —
// safe to reimplement freely here with no cross-domain isolation concern.
//
// Production's version (`hazardeventform.tsx`'s `visibleModalDiscard` Dialog) has a
// "Save as draft" button in its own footer alongside "Discard work and exit" — a duplicate of
// what `SaveSubmitDialog` already offers. This rebuild intentionally drops that duplicate: saving
// as a draft belongs to the rebuilt `SaveSubmitDialog` (task 3.9) alone, so this dialog only needs
// to reproduce the actual "confirm before losing unsaved changes" intent — offering a clear way to
// either exit and discard, or cancel and keep editing (production has no explicit "cancel" button
// of its own, relying only on the PrimeReact `Dialog`'s built-in dismiss; this adds one deliberately
// since a confirmation dialog with no visible way to back out is a real UX gap, not a faithful
// reproduction worth keeping).
import {
	Button,
	Dialog,
	Heading,
	Modal,
	ModalOverlay,
} from "react-aria-components";

import { ViewContext } from "~/frontend/context";

export function DiscardDialogRac({
	ctx,
	isOpen,
	onOpenChange,
	onDiscard,
}: {
	ctx: ViewContext;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onDiscard: () => void;
}) {
	return (
		<ModalOverlay
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			isDismissable
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		>
			<Modal className="w-[28rem] max-w-full rounded-[0.57rem] bg-white p-6 shadow-lg">
				<Dialog className="outline-none">
					<Heading
						slot="title"
						className="mb-2 text-lg font-medium text-[#181823]"
					>
						{ctx.t({
							code: "common.exit_confirmation",
							msg: "Are you sure you want to exit?",
						})}
					</Heading>
					<p className="mb-6 text-sm text-[#333333]">
						{ctx.t({
							code: "common.unsaved_changes_warning",
							msg: "If you leave this page, your work will not be saved.",
						})}
					</p>
					<div className="flex flex-col gap-3">
						<Button
							onPress={onDiscard}
							className="rounded-[0.57rem] bg-[#004f91] px-[1.14rem] py-[0.8rem] font-medium text-white data-[hovered]:bg-[#106cb8] data-[focus-visible]:shadow-[0_0_0_2px_#106cb8] data-[focus-visible]:outline-none"
						>
							{ctx.t({
								code: "common.discard_work_and_exit",
								msg: "Discard work and exit",
							})}
						</Button>
						<Button
							onPress={() => onOpenChange(false)}
							className="rounded-[0.57rem] border border-gray-300 px-[1.14rem] py-[0.8rem] font-medium data-[hovered]:bg-[#e6e6e6] data-[focus-visible]:shadow-[0_0_0_2px_#106cb8] data-[focus-visible]:outline-none"
						>
							{ctx.t({
								code: "common.keep_editing",
								msg: "Keep editing",
							})}
						</Button>
					</div>
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}
