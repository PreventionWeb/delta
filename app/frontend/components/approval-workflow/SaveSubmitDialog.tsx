import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { MultiSelect, MultiSelectChangeEvent } from "primereact/multiselect";
import { useState, useEffect } from "react";
import { DContext } from "~/utils/dcontext";

export interface UserValidator {
	name: string;
	id: string;
	email: string;
}

export type SaveAction =
	| "submit-draft"
	| "submit-validate"
	| "submit-publish"
	| "submit-validation";

export interface SaveSubmitDialogProps {
	ctx: DContext;
	visible: boolean;
	onHide: () => void;
	onSubmit: (action: SaveAction, validators?: string) => void;
	usersWithValidatorRole?: UserValidator[];
	userRole?: string;
}

export function SaveSubmitDialog(props: SaveSubmitDialogProps) {
	const {
		ctx,
		visible,
		onHide,
		onSubmit,
		usersWithValidatorRole = [],
		userRole,
	} = props;

	const [selectedAction, setSelectedAction] =
		useState<SaveAction>("submit-draft");
	const [selectedUserValidator, setSelectedUserValidator] = useState<
		UserValidator[]
	>([]);
	const [publishChecked, setPublishChecked] = useState(false);

	// Reset state when dialog closes
	useEffect(() => {
		if (!visible) {
			setSelectedAction("submit-draft");
			setSelectedUserValidator([]);
			setPublishChecked(false);
		}
	}, [visible]);

	const actionLabels: Record<SaveAction, string> = {
		"submit-validate": ctx.t({
			code: "common.validate_record",
			msg: "Validate record",
		}),
		"submit-publish": ctx.t({
			code: "common.validate_and_publish_record",
			msg: "Validate and publish record",
		}),
		"submit-draft": ctx.t({ code: "common.save_draft", msg: "Save as draft" }),
		"submit-validation": ctx.t({
			code: "common.submit_for_validation",
			msg: "Submit for validation",
		}),
	};

	const handleSubmit = () => {
		const validatorIds =
			selectedAction === "submit-validation"
				? selectedUserValidator.map((v) => v.id).join(",")
				: undefined;

		onSubmit(selectedAction, validatorIds);
	};

	const isSubmitDisabled =
		selectedAction === "submit-validation" &&
		(!selectedUserValidator || selectedUserValidator.length === 0);

	const optionCardBaseStyle = {
		display: "flex",
		alignItems: "flex-start",
		gap: "1rem",
		width: "100%",
		padding: "1.25rem 1.4rem",
		borderRadius: "18px",
		borderWidth: "2px",
		borderStyle: "solid" as const,
		borderColor: "#dde3ea",
		background: "#ffffff",
		outline: "none",
		boxShadow: "none",
		textAlign: "left" as const,
		cursor: "default",
		transition: "border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease",
	};

	const optionCardSelectedStyle = {
		borderColor: "#1d66b1",
		background: "#f7fbff",
		boxShadow: "0 0 0 1px rgba(29, 102, 177, 0.08), 0 10px 24px rgba(29, 102, 177, 0.12)",
	};

	const optionIconWrapStyle = {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: "2.75rem",
		height: "2.75rem",
		borderRadius: "999px",
		background: "#eaf2fb",
		color: "#1d66b1",
		flexShrink: 0,
		fontSize: "1.05rem",
	};

	const optionMeta = {
		"submit-draft": {
			icon: "pi pi-save",
			description: ctx.t({
				code: "common.store_for_future_editing",
				msg: "Store this entry for future editing",
			}),
		},
		"submit-validate": {
			icon: "pi pi-shield",
			description: ctx.t({
				code: "common.validate_description",
				msg: "This indicates that the event has been checked for accuracy.",
			}),
		},
		"submit-publish": {
			icon: "pi pi-shield",
			description: ctx.t({
				code: "common.validate_description",
				msg: "This indicates that the event has been checked for accuracy.",
			}),
		},
		"submit-validation": {
			icon: "pi pi-send",
			description: ctx.t({
				code: "common.request_entry_validation",
				msg: "Request this entry to be validated",
			}),
		},
	} satisfies Record<SaveAction, { icon: string; description: string }>;

	const renderOptionCard = (
		action: SaveAction,
		title: string,
		content: React.ReactNode,
		onSelect: () => void,
		selected = selectedAction === action ||
			(action === "submit-validate" && selectedAction === "submit-publish"),
	) => {
		return (
			<div
				className={`save-submit-option-card${
					selected ? " save-submit-option-card--selected" : ""
				}`}
				style={{
					...optionCardBaseStyle,
					...(selected ? optionCardSelectedStyle : {}),
				}}
			>
				<input
					type="radio"
					name="saveSubmitAction"
					checked={selected}
					onChange={onSelect}
					aria-label={title}
					className="save-submit-option-radio"
					style={{
						width: "1.35rem",
						height: "1.35rem",
						marginTop: "0.4rem",
						border: "2px solid #aeb8c4",
						borderRadius: "999px",
						background: selected
							? "radial-gradient(circle at center, #1d66b1 0 34%, #ffffff 35%)"
							: "#ffffff",
						flexShrink: 0,
						cursor: "pointer",
						appearance: "none" as const,
						WebkitAppearance: "none" as const,
						MozAppearance: "none" as const,
						outline: "none",
						boxShadow: "none",
					}}
				/>
				<span style={optionIconWrapStyle}>
					<i className={optionMeta[action].icon} aria-hidden="true" />
				</span>
				<div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", flex: 1 }}>
					<div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
						<span style={{ fontSize: "1.05rem", fontWeight: 600, color: "#24364b" }}>
							{title}
						</span>
					</div>
					<div style={{ color: "#6b7c93", lineHeight: 1.45 }}>{content}</div>
				</div>
			</div>
		);
	};

	const footerContent = (
		<Button
			type="button"
			data-testid={
				selectedAction === "submit-draft" ? "save-draft" : undefined
			}
			disabled={isSubmitDisabled}
			className="mg-button mg-button-primary"
			label={actionLabels[selectedAction]}
			style={{ width: "100%" }}
			onClick={handleSubmit}
			autoFocus
		/>
	);

	return (
		<Dialog
			visible={visible}
			modal
			header={ctx.t({ code: "common.savesubmit", msg: "Save or submit" })}
			footer={footerContent}
			style={{ width: "50rem" }}
			className="save-submit-dialog"
			onHide={onHide}
		>
			<style>{`
				.save-submit-option-card {
					border-color: #e1e7ee !important;
					box-shadow: none !important;
				}

				.save-submit-option-card--selected {
					border-color: #1d66b1 !important;
					box-shadow: 0 0 0 1px rgba(29, 102, 177, 0.08), 0 10px 24px rgba(29, 102, 177, 0.12) !important;
				}

				.save-submit-option-card:focus,
				.save-submit-option-card:focus-visible,
				.save-submit-option-card:focus-within {
					outline: none !important;
				}

				.save-submit-option-radio,
				.save-submit-option-radio:focus,
				.save-submit-option-radio:focus-visible {
					outline: none !important;
					box-shadow: none !important;
				}
			`}</style>

			<div>
				<p>
					{ctx.t({
						code: "validationflow.savesubmitmodal.decide_action",
						msg: "Decide what you'd like to do with this data that you've added or updated.",
					})}
				</p>
				<p> </p>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
				{renderOptionCard(
					"submit-draft",
					ctx.t({ code: "common.save_draft", msg: "Save as draft" }),
					<>
						<span>{optionMeta["submit-draft"].description}</span>
					</>,
					() => {
						setPublishChecked(false);
						setSelectedAction("submit-draft");
					},
				)}

				{userRole === "admin" &&
					renderOptionCard(
						"submit-validate",
						ctx.t({ code: "common.validate", msg: "Validate" }),
						<>
							<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
								<span>{optionMeta["submit-validate"].description}</span>
								<div style={{ display: "flex", alignItems: "flex-start", gap: "0.9rem" }}>
									<Checkbox
										id="publish-checkbox"
										name="publish-checkbox"
										onChange={(e) => {
											if (e.checked === undefined) return;
											if (!e.checked) {
												setSelectedAction("submit-validate");
												setPublishChecked(false);
											} else {
												setPublishChecked(true);
												setSelectedAction("submit-publish");
											}
										}}
										checked={publishChecked}
									/>
									<div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
										<div style={{ fontWeight: 500, color: "#24364b" }}>
											{ctx.t({
												code: "common.publish_undrr_instance",
												msg: "Publish to UNDRR instance",
											})}
										</div>
										<span style={{ color: "#6b7c93" }}>
											{ctx.t({
												code: "common.publish_undrr_instance_description",
												msg: "Data from this event will be made publicly available.",
											})}
										</span>
									</div>
								</div>
							</div>
						</>,
						() => {
							setPublishChecked(false);
							setSelectedAction("submit-validate");
						},
						selectedAction === "submit-validate" ||
							selectedAction === "submit-publish",
					)}

				{(userRole === "data-validator" ||
					userRole === "data-collector" ||
					userRole === "admin") &&
					renderOptionCard(
						"submit-validation",
						ctx.t({
							code: "common.submit_for_validation",
							msg: "Submit for validation",
						}),
						<>
							<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
								<span>{optionMeta["submit-validation"].description}</span>
								<div>
									* {ctx.t({
										code: "common.select_validators",
										msg: "Select validator(s)",
									})}
								</div>
								<MultiSelect
									filter
									value={selectedUserValidator}
									disabled={selectedAction !== "submit-validation"}
									onChange={(e: MultiSelectChangeEvent) =>
										setSelectedUserValidator(e.value)
									}
									options={usersWithValidatorRole}
									optionLabel="name"
									placeholder={ctx.t({
										code: "common.select_validators",
										msg: "Select validator(s)",
									})}
									className="w-full save-modal-notify-multiselect"
									display="chip"
									maxSelectedLabels={7}
								/>
							</div>
						</>,
						() => {
							setPublishChecked(false);
							setSelectedAction("submit-validation");
						},
					)}
			</div>
		</Dialog>
	);
}
