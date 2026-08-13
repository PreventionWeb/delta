// Shared, POC-local placeholder Modal/Dialog for the list page's Actions column
// (openspec/changes/poc-react-aria-hazardous-event, task 2.9; design.md Decision 3, revised
// "DataCollectionActionLinks disposition" note).
//
// The fixture rows (fixtures/listRows.ts) use fake, non-DB-backed ids, so wiring the real
// edit/view `LangLink`s or the real `HazardousEventDeleteButton`/`delete-dialog.tsx` confirm flow
// against them would 404 or error against nonexistent data — worse for a visual-parity spike than
// a clearly-labeled mock. All three action buttons (edit/view/delete) render this same component
// with a different icon/label, rather than performing real navigation or a real delete submit.
import {
	DialogTrigger,
	ModalOverlay,
	Modal,
	Dialog,
	Heading,
	Button,
} from "react-aria-components";

import { ViewContext } from "~/frontend/context";

// Reproduces style-dts.css's `.mg-button-table` look (transparent, #333 icon, #e6e6e6/#004f91 on
// hover/focus) with Tailwind utilities rather than applying that class to the RAC primitive
// directly (design.md Decision 7: new markup is styled with Tailwind, not legacy dts-*/mg-button
// classes).
//
// Task 2.15 fix: the icon sprite files (public/assets/icons/edit.svg etc.) are themselves root
// `<svg width="24" height="24" viewBox="0 0 24 24">` elements referenced via `<use>`. Per the SVG2
// spec, a `<use>` with no own width/height inherits the *referenced* element's width/height (24x24)
// for its generated instance, ignoring the outer wrapper svg's CSS-set 1.14rem (~18px) box — so the
// icon rendered at native 24x24 size and got clipped to the outer viewport's top-left corner
// (confirmed via a cropped screenshot: recognizable icons appeared as unrecognizable fragments).
// `.mg-button svg *` in style-dts.css works around the exact same issue with
// `transform: scale(0.75) translate(-2px, -2px)` (0.75 * 24 = 18 ~= 1.14rem, translate recenters
// after the top-left-anchored scale) — reproduced here verbatim on the `<use>` element itself.
const actionButtonClass =
	"flex h-9 w-9 items-center justify-center rounded-[0.57rem] border border-transparent bg-transparent text-[#333333] [&_svg]:h-[1.14rem] [&_svg]:w-[1.14rem] [&_svg>use]:[transform:scale(0.75)_translate(-2px,-2px)] data-[hovered]:bg-[#e6e6e6] data-[hovered]:text-[#004f91] data-[focus-visible]:bg-[#e6e6e6] data-[focus-visible]:text-[#004f91] data-[focus-visible]:outline-none";

export function MockActionButton({
	ctx,
	icon,
	label,
}: {
	ctx: ViewContext;
	/** SVG sprite reference, e.g. "/assets/icons/edit.svg#edit" — production's exact icon assets
	 *  (app/frontend/components/data-collection/ActionLinks.tsx), reused here for visual parity. */
	icon: string;
	label: string;
}) {
	return (
		<DialogTrigger>
			<Button className={actionButtonClass} aria-label={label}>
				<svg aria-hidden="true" focusable="false" role="img">
					<use href={icon} />
				</svg>
			</Button>
			<ModalOverlay
				isDismissable
				className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
			>
				<Modal className="w-[24rem] max-w-[90vw] rounded-[0.57rem] bg-white p-6 shadow-lg">
					<Dialog className="outline-none">
						{({ close }) => (
							<>
								<Heading
									slot="title"
									className="mb-2 text-lg font-medium text-[#181823]"
								>
									{label}
								</Heading>
								<p className="mb-6 text-sm text-[#333333]">
									{ctx.t({
										code: "poc.hazardous_events.action_not_wired_up",
										msg: "This action isn't wired up in this POC — mocked data only.",
									})}
								</p>
								<div className="flex justify-end">
									<Button
										onPress={close}
										className="inline-flex cursor-pointer items-center justify-center rounded-[0.57rem] bg-[#004f91] px-[1.14rem] py-[0.8rem] font-medium leading-[1.14] text-white data-[hovered]:bg-[#106cb8] data-[focus-visible]:shadow-[0_0_0_2px_#106cb8] data-[focus-visible]:outline-none"
									>
										{ctx.t({ code: "common.close", msg: "Close" })}
									</Button>
								</div>
							</>
						)}
					</Dialog>
				</Modal>
			</ModalOverlay>
		</DialogTrigger>
	);
}
