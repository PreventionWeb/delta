// Rebuild of `SaveSubmitDialog` (task 3.9, openspec/changes/poc-react-aria-hazardous-event;
// design.md Decision 3's `SaveSubmitDialog` row) as a brand-new POC-local component using React
// Aria `Modal`/`Dialog`, `RadioGroup`/`Radio`, `Checkbox`, and `ComboBox` (multi-select) — NOT an
// in-place edit of `app/frontend/components/approval-workflow/SaveSubmitDialog.tsx`, which is also
// imported by `disastereventform.tsx`, `disaster-record/form.tsx`, and `DisasterEventForm.tsx`
// (verified by grep); editing it in place would change behavior for those domains too.
//
// This reproduces the real component's actual *rules*, not just its visual shape (read directly
// from `SaveSubmitDialog.tsx` before writing this file):
// - "Save as draft" (`submit-draft`) is always offered, requires no validator selection.
// - "Validate" (`submit-validate`/`submit-publish`) is admin-only (`userRole === "admin"`); a
//   nested checkbox toggles "Validate" into "Validate and publish" (`submit-publish`) — this is
//   the "checkbox" design.md Decision 3 calls out as a widget to reproduce.
// - "Submit for validation" (`submit-validation`) is offered to
//   data-validator/data-collector/admin roles; the primary action button is disabled unless at
//   least one validator is selected — reproduced below via `isConfirmDisabled`.
//
// **Multi-select finding (design.md Risks — "the single hardest UI piece in this spike"):** RAC's
// `ComboBox` (v1.20, checked via `node_modules/react-aria-components/dist/private/ComboBox.mjs`
// and the `useComboBoxState` types) genuinely supports `selectionMode="multiple"` with a
// `value: Key[]` / `onChange: (keys: Key[]) => void` pair — this is a real multi-select
// combobox, not a hand-rolled substitute, and reaches acceptable parity with PrimeReact's
// `MultiSelect` (filter input, popover option list, selected-count-aware display) without
// needing `tailwindcss-react-aria-components` or a third-party add-on. The one visual gap:
// production's `MultiSelect` renders selected values as inline chips inside the trigger itself
// (`display="chip"`); RAC's built-in `<ComboBoxValue>` only renders a comma-separated text
// summary there. This component closes that gap by rendering its own removable chip row below
// the combobox (derived from `selectedValidatorIds` + `usersWithValidatorRole`, not from
// `ComboBoxValue`) — a small amount of extra markup, not a parity failure.
import { useEffect, useState } from "react";
import type { Key } from "react-aria-components";
import {
	Button,
	Checkbox,
	ComboBox,
	Dialog,
	Group,
	Heading,
	Input,
	ListBox,
	ListBoxItem,
	Modal,
	ModalOverlay,
	Popover,
	Radio,
	RadioGroup,
} from "react-aria-components";

import { ViewContext } from "~/frontend/context";

export type SaveSubmitAction =
	| "submit-draft"
	| "submit-validate"
	| "submit-publish"
	| "submit-validation";

export interface UserValidatorOption {
	id: string;
	name: string;
	email: string;
}

const radioItemClass =
	"flex items-start gap-3 rounded-[0.57rem] border border-gray-200 p-3";
const radioCircleClass =
	"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-gray-400 data-[selected]:border-[#004f91]";
const checkboxBoxClass =
	"flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-400 data-[selected]:border-[#004f91] data-[selected]:bg-[#004f91]";
const comboGroupClass =
	"flex items-center gap-2 rounded border border-gray-300 bg-white px-2 py-1 data-[disabled]:opacity-50 data-[focus-within]:outline data-[focus-within]:outline-2 data-[focus-within]:outline-[#106cb8]";
const popoverClass =
	"w-[var(--trigger-width)] rounded border border-gray-300 bg-white shadow-lg";
const listBoxClass = "max-h-52 overflow-auto p-1";
const listBoxItemClass =
	"cursor-pointer rounded px-2 py-1 text-sm data-[focused]:bg-[#e6e6e6] data-[disabled]:opacity-50";
const chipClass =
	"inline-flex items-center gap-1 rounded-full bg-[#e6e6e6] px-2 py-0.5 text-xs text-[#333333]";
const primaryButtonClass =
	"w-full rounded-[0.57rem] bg-[#004f91] px-[1.14rem] py-[0.8rem] font-medium text-white data-[hovered]:bg-[#106cb8] data-[focus-visible]:shadow-[0_0_0_2px_#106cb8] data-[focus-visible]:outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50";

export function SaveSubmitDialogRac({
	ctx,
	isOpen,
	onOpenChange,
	onConfirm,
	usersWithValidatorRole,
	userRole,
}: {
	ctx: ViewContext;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (action: SaveSubmitAction, validatorIds: string[]) => void;
	usersWithValidatorRole: UserValidatorOption[];
	userRole?: string;
}) {
	// `selectedGroup` is the RadioGroup's own bound value — it must always be one of the three
	// actual `value`s a `Radio` in this group declares ("submit-draft" | "submit-validate" |
	// "submit-validation"), or native radio semantics break (no radio would be marked checked at
	// all if the group's controlled value were "submit-publish", since no `Radio` declares that
	// value). Production's real component sidesteps this because it drives a single native
	// `<input type="radio">` from JS with
	// `checked={selectedAction === "submit-validate" || selectedAction === "submit-publish"}` —
	// two states mapped to one radio's checked-ness. RAC's `RadioGroup` doesn't expose that
	// escape hatch, so the same two states are represented here as one group value
	// ("submit-validate") plus the separate `publishChecked` boolean, and the real 4-way
	// `SaveSubmitAction` is derived below rather than stored directly.
	const [selectedGroup, setSelectedGroup] = useState<
		"submit-draft" | "submit-validate" | "submit-validation"
	>("submit-draft");
	const [selectedValidatorIds, setSelectedValidatorIds] = useState<Key[]>([]);
	const [publishChecked, setPublishChecked] = useState(false);

	const selectedAction: SaveSubmitAction =
		selectedGroup === "submit-validate" && publishChecked
			? "submit-publish"
			: selectedGroup;

	// Reset state when the dialog closes — matches the real SaveSubmitDialog's own
	// close-triggered reset effect, so reopening always starts from "Save as draft".
	useEffect(() => {
		if (!isOpen) {
			setSelectedGroup("submit-draft");
			setSelectedValidatorIds([]);
			setPublishChecked(false);
		}
	}, [isOpen]);

	const canValidate = userRole === "admin";
	const canSubmitForValidation =
		userRole === "data-validator" ||
		userRole === "data-collector" ||
		userRole === "admin";

	const actionLabels: Record<SaveSubmitAction, string> = {
		"submit-draft": ctx.t({ code: "common.save_draft", msg: "Save as draft" }),
		"submit-validate": ctx.t({
			code: "common.validate_record",
			msg: "Validate record",
		}),
		"submit-publish": ctx.t({
			code: "common.validate_and_publish_record",
			msg: "Validate and publish record",
		}),
		"submit-validation": ctx.t({
			code: "common.submit_for_validation",
			msg: "Submit for validation",
		}),
	};

	// Same rule as the real component: submit-for-validation requires at least one validator.
	const isConfirmDisabled =
		selectedAction === "submit-validation" && selectedValidatorIds.length === 0;

	const handleConfirm = () => {
		if (isConfirmDisabled) return;
		const validatorIds =
			selectedAction === "submit-validation"
				? selectedValidatorIds.map((id) => String(id))
				: [];
		onConfirm(selectedAction, validatorIds);
	};

	const selectedValidators = selectedValidatorIds
		.map((id) => usersWithValidatorRole.find((u) => u.id === id))
		.filter((u): u is UserValidatorOption => !!u);

	return (
		<ModalOverlay
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			isDismissable
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		>
			<Modal className="w-[40rem] max-w-full rounded-[0.57rem] bg-white p-6 shadow-lg">
				<Dialog className="outline-none">
					<Heading
						slot="title"
						className="mb-2 text-lg font-medium text-[#181823]"
					>
						{ctx.t({ code: "common.savesubmit", msg: "Save or submit" })}
					</Heading>
					<p className="mb-4 text-sm text-[#333333]">
						{ctx.t({
							code: "validationflow.savesubmitmodal.decide_action",
							msg: "Decide what you'd like to do with this data that you've added or updated.",
						})}
					</p>

					<RadioGroup
						value={selectedGroup}
						onChange={(v) => {
							setSelectedGroup(
								v as "submit-draft" | "submit-validate" | "submit-validation",
							);
							// Leaving the "Validate" radio entirely resets the nested checkbox —
							// otherwise re-selecting "Validate" later would silently resurrect a
							// stale "and publish" choice the user never re-confirmed.
							if (v !== "submit-validate") setPublishChecked(false);
						}}
						className="flex flex-col gap-3"
						aria-label={ctx.t({
							code: "common.savesubmit",
							msg: "Save or submit",
						})}
					>
						<Radio value="submit-draft" className={radioItemClass}>
							{({ isSelected }) => (
								<>
									<span
										className={radioCircleClass}
										data-selected={isSelected || undefined}
									>
										{isSelected ? (
											<span className="h-2 w-2 rounded-full bg-[#004f91]" />
										) : null}
									</span>
									<span className="flex flex-col gap-0.5 text-sm">
										<span className="font-medium text-[#333333]">
											{ctx.t({
												code: "common.save_draft",
												msg: "Save as draft",
											})}
										</span>
										<span className="text-gray-500">
											{ctx.t({
												code: "common.store_for_future_editing",
												msg: "Store this entry for future editing",
											})}
										</span>
									</span>
								</>
							)}
						</Radio>

						{canValidate ? (
							// The nested `Checkbox` is a SIBLING of `Radio`, not a child of it.
							// `Radio` renders its content inside a native `<label>` wrapping a
							// visually-hidden radio `<input>` (confirmed by reading
							// `node_modules/react-aria-components/dist/private/RadioGroup.mjs`) —
							// nesting another interactive widget inside that `<label>` gets its
							// clicks consumed by the label's own activation handling before they
							// ever reach the nested widget (confirmed via a live repro: clicking
							// the widget silently reset the RadioGroup's selection back to
							// "submit-draft" and the widget's own popover never opened).
							// Production's real `SaveSubmitDialog.tsx` already keeps its
							// `<label>` (just the native radio input) and the option's
							// title/description/nested-widget content as siblings under a shared
							// `<li>` — this restructure just reproduces that same DOM shape.
							<div className={radioItemClass}>
								<Radio
									value="submit-validate"
									aria-label={ctx.t({
										code: "common.validate",
										msg: "Validate",
									})}
									className="flex items-start gap-3"
								>
									{({ isSelected }) => (
										<span
											className={radioCircleClass}
											data-selected={isSelected || undefined}
										>
											{isSelected ? (
												<span className="h-2 w-2 rounded-full bg-[#004f91]" />
											) : null}
										</span>
									)}
								</Radio>
								<span className="flex flex-1 flex-col gap-2 text-sm">
									<span className="flex flex-col gap-0.5">
										<span className="font-medium text-[#333333]">
											{ctx.t({ code: "common.validate", msg: "Validate" })}
										</span>
										<span className="text-gray-500">
											{ctx.t({
												code: "common.validate_description",
												msg: "This indicates that the event has been checked for accuracy.",
											})}
										</span>
									</span>
									<Checkbox
										isSelected={publishChecked}
										isDisabled={selectedGroup !== "submit-validate"}
										onChange={setPublishChecked}
										className="flex items-start gap-2"
									>
										{({ isSelected: checkboxSelected }) => (
											<>
												<span
													className={checkboxBoxClass}
													data-selected={checkboxSelected || undefined}
												>
													{checkboxSelected ? (
														<span className="h-2 w-2 rounded-sm bg-white" />
													) : null}
												</span>
												<span className="flex flex-col gap-0.5">
													<span className="text-[#333333]">
														{ctx.t({
															code: "common.publish_undrr_instance",
															msg: "Publish to UNDRR instance",
														})}
													</span>
													<span className="text-gray-500">
														{ctx.t({
															code: "common.publish_undrr_instance_description",
															msg: "Data from this event will be made publicly available.",
														})}
													</span>
												</span>
											</>
										)}
									</Checkbox>
								</span>
							</div>
						) : null}

						{canSubmitForValidation ? (
							// Same restructure as the "Validate" row above — the ComboBox and its
							// chip row are siblings of `Radio`, not children of it (see that
							// row's comment for why).
							<div className={radioItemClass}>
								<Radio
									value="submit-validation"
									aria-label={ctx.t({
										code: "common.submit_for_validation",
										msg: "Submit for validation",
									})}
									className="flex items-start gap-3"
								>
									{({ isSelected }) => (
										<span
											className={radioCircleClass}
											data-selected={isSelected || undefined}
										>
											{isSelected ? (
												<span className="h-2 w-2 rounded-full bg-[#004f91]" />
											) : null}
										</span>
									)}
								</Radio>
								<span className="flex flex-1 flex-col gap-2 text-sm">
									<span className="flex flex-col gap-0.5">
										<span className="font-medium text-[#333333]">
											{ctx.t({
												code: "common.submit_for_validation",
												msg: "Submit for validation",
											})}
										</span>
										<span className="text-gray-500">
											{ctx.t({
												code: "common.request_entry_validation",
												msg: "Request this entry to be validated",
											})}
										</span>
									</span>
									<span className="text-xs font-medium text-[#333333]">
										*{" "}
										{ctx.t({
											code: "common.select_validators",
											msg: "Select validator(s)",
										})}
									</span>
									<ComboBox
										selectionMode="multiple"
										value={selectedValidatorIds}
										onChange={setSelectedValidatorIds}
										isDisabled={selectedGroup !== "submit-validation"}
										menuTrigger="focus"
										aria-label={ctx.t({
											code: "common.select_validators",
											msg: "Select validator(s)",
										})}
										className="flex flex-col gap-1"
									>
										<Group className={comboGroupClass}>
											<Input
												placeholder={ctx.t({
													code: "common.select_validators",
													msg: "Select validator(s)",
												})}
												className="flex-1 bg-transparent text-sm outline-none"
											/>
											<Button className="text-xs text-gray-500">▾</Button>
										</Group>
										<Popover className={popoverClass}>
											<ListBox className={listBoxClass}>
												{usersWithValidatorRole.map((u) => (
													<ListBoxItem
														key={u.id}
														id={u.id}
														textValue={u.name}
														className={listBoxItemClass}
													>
														{({ isSelected: itemSelected }) => (
															<span className="flex items-center gap-2">
																<span
																	className={checkboxBoxClass}
																	data-selected={itemSelected || undefined}
																>
																	{itemSelected ? (
																		<span className="h-2 w-2 rounded-sm bg-white" />
																	) : null}
																</span>
																{u.name}{" "}
																<span className="text-gray-400">
																	({u.email})
																</span>
															</span>
														)}
													</ListBoxItem>
												))}
											</ListBox>
										</Popover>
									</ComboBox>
									{selectedValidators.length > 0 ? (
										<div className="flex flex-wrap gap-1.5">
											{selectedValidators.map((u) => (
												<span key={u.id} className={chipClass}>
													{u.name}
													<button
														type="button"
														aria-label={ctx.t({
															code: "common.remove",
															msg: "Remove",
														})}
														onClick={() =>
															setSelectedValidatorIds((prev) =>
																prev.filter((id) => String(id) !== u.id),
															)
														}
														className="text-gray-500 hover:text-[#333333]"
													>
														×
													</button>
												</span>
											))}
										</div>
									) : null}
								</span>
							</div>
						) : null}
					</RadioGroup>

					<div className="mt-6">
						<Button
							isDisabled={isConfirmDisabled}
							onPress={handleConfirm}
							className={primaryButtonClass}
						>
							{actionLabels[selectedAction]}
						</Button>
					</div>
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}
