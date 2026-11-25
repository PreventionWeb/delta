import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ValidatorCandidate } from "~/domains/validation-workflow/application/ports/IValidatorCandidateRepository";
import { Dialog } from "~/design-system/components/Dialog";
import { LegacyButton as Button } from "~/design-system/components/LegacyButton";
import { Checkbox } from "~/design-system/components/Checkbox";
import { MultiSelectCombobox } from "~/design-system/components/MultiSelectCombobox";

/** Legacy's own ApprovalAction names (SaveSubmitDialog.tsx) -- submit-return excluded (design.md
 * Decision 7, DEF-053). */
export type SaveAction =
	| "submit-draft"
	| "submit-validate"
	| "submit-publish"
	| "submit-validation";

export interface HazardousEventSaveSubmitModalProps {
	visible: boolean;
	onHide: () => void;
	onSubmit: (action: SaveAction, validatorUserIds: readonly string[]) => void;
	validatorCandidates: readonly ValidatorCandidate[];
	role: string | null;
}

/** Role-gated option cards, ported from legacy's SaveSubmitDialog.tsx (same content/behavior).
 * Migrated off PrimeReact onto the new design-system Dialog/Button/Checkbox/MultiSelectCombobox
 * (design.md Decision 12) -- same behavior, new chrome. */
export function HazardousEventSaveSubmitModal({
	visible,
	onHide,
	onSubmit,
	validatorCandidates,
	role,
}: HazardousEventSaveSubmitModalProps) {
	const { t } = useTranslation("hazardous-events");
	const [selectedAction, setSelectedAction] =
		useState<SaveAction>("submit-draft");
	const [selectedValidatorIds, setSelectedValidatorIds] = useState<
		readonly string[]
	>([]);
	const [publishChecked, setPublishChecked] = useState(false);
	// firstName alone is ambiguous between two candidates sharing one (code review finding) --
	// legacy shows the full name. MultiSelectCombobox's fixed {id, name} shape (Decision 12).
	const validatorOptions = validatorCandidates.map((c) => ({
		id: c.id,
		name: `${c.firstName} ${c.lastName}`.trim(),
	}));

	useEffect(() => {
		if (!visible) {
			setSelectedAction("submit-draft");
			setSelectedValidatorIds([]);
			setPublishChecked(false);
		}
	}, [visible]);

	const isSubmitDisabled =
		selectedAction === "submit-validation" && selectedValidatorIds.length === 0;

	// Two string sets, matching legacy's SaveSubmitDialog.tsx: each card's title is short
	// ("Validate"); the footer button's label is the longer form ("Validate record") once selected.
	const cardTitles: Record<SaveAction, string> = {
		"submit-draft": t("form.save_submit.actions.save_draft"),
		"submit-validate": t("form.save_submit.card_titles.validate"),
		// Never actually rendered -- the admin card's title stays "Validate"; legacy only swaps
		// the footer label when publish is checked. Kept for the Record's type completeness.
		"submit-publish": t("form.save_submit.card_titles.validate"),
		"submit-validation": t("form.save_submit.actions.submit_for_validation"),
	};
	const footerLabels: Record<SaveAction, string> = {
		"submit-draft": t("form.save_submit.actions.save_draft"),
		"submit-validate": t("form.save_submit.actions.validate"),
		"submit-publish": t("form.save_submit.actions.validate_and_publish"),
		"submit-validation": t("form.save_submit.actions.submit_for_validation"),
	};

	function handleSubmit() {
		onSubmit(
			selectedAction,
			selectedAction === "submit-validation" ? selectedValidatorIds : [],
		);
	}

	function cardClassName(selected: boolean): string {
		return `flex items-start gap-4 w-full rounded-2xl border-2 p-5 ${
			selected ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white"
		}`;
	}

	// Legacy's own icon choice (PrimeIcons, already loaded globally) -- submit-publish shares
	// submit-validate's icon, same as legacy (one card, a nested checkbox switches the action).
	const cardIcons: Record<SaveAction, string> = {
		"submit-draft": "pi-save",
		"submit-validate": "pi-shield",
		"submit-publish": "pi-shield",
		"submit-validation": "pi-send",
	};

	function IconBadge({ action }: { action: SaveAction }) {
		return (
			<span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#eaf2fb] text-lg text-[#1d66b1]">
				<i className={`pi ${cardIcons[action]}`} aria-hidden="true" />
			</span>
		);
	}

	return (
		<Dialog
			isOpen={visible}
			onOpenChange={(open) => {
				if (!open) onHide();
			}}
			title={t("form.save_submit.title")}
			closeLabel={t("form.close")}
			footer={
				<Button
					type="button"
					variant="primary"
					disabled={isSubmitDisabled}
					autoFocus
					onPress={handleSubmit}
				>
					{footerLabels[selectedAction]}
				</Button>
			}
		>
			<p>{t("form.save_submit.decide_action")}</p>
			<div
				className="flex flex-col gap-4"
				role="radiogroup"
				aria-label={t("form.save_submit.title")}
			>
				<div className={cardClassName(selectedAction === "submit-draft")}>
					<input
						type="radio"
						name="saveSubmitAction"
						className="mt-1 h-5 w-5 accent-blue-600"
						checked={selectedAction === "submit-draft"}
						onChange={() => {
							setPublishChecked(false);
							setSelectedAction("submit-draft");
						}}
						aria-label={cardTitles["submit-draft"]}
					/>
					<IconBadge action="submit-draft" />
					<div className="flex flex-col gap-1">
						<span className="font-semibold text-gray-800">
							{cardTitles["submit-draft"]}
						</span>
						<span className="text-gray-500">
							{t("form.save_submit.descriptions.save_draft")}
						</span>
					</div>
				</div>

				{role === "admin" && (
					<div
						className={cardClassName(
							selectedAction === "submit-validate" ||
								selectedAction === "submit-publish",
						)}
					>
						<input
							type="radio"
							name="saveSubmitAction"
							className="mt-1 h-5 w-5 accent-blue-600"
							checked={
								selectedAction === "submit-validate" ||
								selectedAction === "submit-publish"
							}
							onChange={() => {
								setPublishChecked(false);
								setSelectedAction("submit-validate");
							}}
							aria-label={cardTitles["submit-validate"]}
						/>
						<IconBadge action="submit-validate" />
						<div className="flex flex-col gap-3">
							<span className="font-semibold text-gray-800">
								{cardTitles["submit-validate"]}
							</span>
							<span className="text-gray-500">
								{t("form.save_submit.descriptions.validate")}
							</span>
							<div className="flex items-start gap-3">
								<Checkbox
									name="publish-checkbox"
									label=""
									onChange={(checked) => {
										setPublishChecked(checked);
										setSelectedAction(
											checked ? "submit-publish" : "submit-validate",
										);
									}}
									checked={publishChecked}
								/>
								<div className="flex flex-col gap-1">
									<div className="font-medium text-gray-800">
										{t("form.save_submit.publish_to_undrr")}
									</div>
									<span className="text-gray-500">
										{t("form.save_submit.publish_to_undrr_description")}
									</span>
								</div>
							</div>
						</div>
					</div>
				)}

				{(role === "data-validator" ||
					role === "data-collector" ||
					role === "admin") && (
					<div
						className={cardClassName(selectedAction === "submit-validation")}
					>
						<input
							type="radio"
							name="saveSubmitAction"
							className="mt-1 h-5 w-5 accent-blue-600"
							checked={selectedAction === "submit-validation"}
							onChange={() => {
								setPublishChecked(false);
								setSelectedAction("submit-validation");
							}}
							aria-label={cardTitles["submit-validation"]}
						/>
						<IconBadge action="submit-validation" />
						<div className="flex flex-col gap-3 flex-1">
							<span className="font-semibold text-gray-800">
								{cardTitles["submit-validation"]}
							</span>
							<span className="text-gray-500">
								{t("form.save_submit.descriptions.submit_for_validation")}
							</span>
							<MultiSelectCombobox
								name="validatorUserIds"
								label={`* ${t("form.save_submit.select_validators")}`}
								options={validatorOptions}
								selectedIds={selectedValidatorIds}
								disabled={selectedAction !== "submit-validation"}
								onSelectionChange={setSelectedValidatorIds}
								removeLabel={(name) =>
									t("form.save_submit.remove_validator", { name })
								}
							/>
						</div>
					</div>
				)}
			</div>
		</Dialog>
	);
}
