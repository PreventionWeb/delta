import { useEffect, useState, ReactElement, useRef } from "react";

import {
	DisasterEventFields,
	DisasterEventViewModel,
	DisasterEventBasicInfoViewModel,
} from "~/backend.server/models/event";

import { hazardousEventLink } from "~/frontend/events/hazardeventform";

import { LangLink } from "~/utils/link";

import {
	UserFormProps,
	FormInputDef,
	FormView,
	FieldErrors,
	Field,
	WrapInputBasic,
	WrapInput,
} from "~/frontend/form";
import { approvalStatusField2 } from "../approval";
import { formatDate } from "~/utils/date";
import { HazardPicker, Hip } from "~/frontend/hip/hazardpicker";

import { SpatialFootprintFormView } from "~/frontend/spatialFootprintFormView";
import { ViewContext } from "../context";
import { DContext } from "~/utils/dcontext";
import { HazardousEventPickerType } from "~/routes/$lang+/hazardous-event+/picker";

import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";

import {
	SaveSubmitDialog,
	SaveAction,
	UserValidator,
} from "~/frontend/components/approval-workflow/SaveSubmitDialog";
import { ViewComponentMainDataCollection } from "../components/data-collection/View";
import DisasterEventReviewStep from "~/frontend/disaster-event/DisasterEventReviewStep";

export const route = "/disaster-event";

function repeatOtherIds(
	ctx: DContext,
	n: number,
): FormInputDef<DisasterEventFields>[] {
	let res = [];
	for (let i = 0; i < n; i++) {
		res.push({
			key: "otherId" + (i + 1),
			label:
				ctx.t({
					code: "disaster_event.other_id",
					msg: "Event ID in other system",
				}) + ` (${i + 1})`,
			type: "text",
			uiRow: i == 0 ? {} : undefined,
			repeatable: { group: "otherId", index: i },
		});
	}
	return res as FormInputDef<DisasterEventFields>[];
}

function repeatRapidOrPreliminaryAssesments(
	ctx: DContext,
	n: number,
): FormInputDef<DisasterEventFields>[] {
	let res = [];
	for (let i = 0; i < n; i++) {
		let j = i + 1;

		res.push(
			{
				key: "rapidOrPreliminaryAssessmentDescription" + j,
				label: ctx.t({
					code: "common.description",
					msg: "Description",
				}),
				type: "textarea",
				uiRow: {
					label:
						ctx.t({
							code: "disaster_event.rapid_preliminary_assessment",
							msg: "Rapid/Preliminary assessment",
						}) + ` (${j})`,
				},
				repeatable: { group: "rapidOrPreliminaryAssessment", index: i },
			},
			{
				key: "rapidOrPreliminaryAssessmentDate" + j,
				label: ctx.t({
					code: "common.date",
					msg: "Date",
				}),
				type: "date",
				repeatable: { group: "rapidOrPreliminaryAssessment", index: i },
			},
		);
	}
	return res as FormInputDef<DisasterEventFields>[];
}

function repeatPostDisasterAssesments(
	ctx: DContext,
	n: number,
): FormInputDef<DisasterEventFields>[] {
	let res = [];
	for (let i = 0; i < n; i++) {
		let j = i + 1;
		res.push(
			{
				key: "postDisasterAssessmentDescription" + j,
				label: ctx.t({
					code: "common.description",
					msg: "Description",
				}),
				type: "textarea",
				uiRow: {
					label:
						ctx.t({
							code: "disaster_event.post_disaster_assessment",
							msg: "Post‑disaster assessment",
						}) + ` (${j})`,
				},
				repeatable: { group: "postDisasterAssessment", index: i },
			},
			{
				key: "postDisasterAssessmentDate" + j,
				label: ctx.t({
					code: "common.date",
					msg: "Date",
				}),
				type: "date",
				repeatable: { group: "postDisasterAssessment", index: i },
			},
		);
	}
	return res as FormInputDef<DisasterEventFields>[];
}

function repeatOtherAssesments(
	ctx: DContext,
	n: number,
): FormInputDef<DisasterEventFields>[] {
	let res = [];
	for (let i = 0; i < n; i++) {
		let j = i + 1;
		res.push(
			{
				key: "otherAssessmentDescription" + j,
				label: ctx.t({
					code: "common.description",
					msg: "Description",
				}),
				type: "textarea",
				uiRow: {
					label:
						ctx.t({
							code: "disaster_event.other_assessment",
							msg: "Other assessment",
						}) + ` (${j})`,
				},
				repeatable: { group: "otherAssessment", index: i },
			},
			{
				key: "otherAssessmentDate" + j,
				label: ctx.t({
					code: "common.date",
					msg: "Date",
				}),
				type: "date",
				repeatable: { group: "otherAssessment", index: i },
			},
		);
	}
	return res as FormInputDef<DisasterEventFields>[];
}

export function fieldsDefCommon(
	ctx: DContext,
): FormInputDef<DisasterEventFields>[] {
	return [
		approvalStatusField2(ctx) as FormInputDef<DisasterEventFields>,
		{
			key: "nationalDisasterId",
			label: ctx.t({
				code: "disaster_event.national_disaster_id",
				msg: "National disaster ID",
			}),
			type: "text",
			uiRow: {},
		},
		...repeatOtherIds(ctx, 3),
		{
			key: "nameNational",
			label: ctx.t({
				code: "disaster_event.national_name",
				desc: "National name for disaster event",
				msg: "National name",
			}),
			description: ctx.t({
				code: "disaster_event.national_name_description",
				desc: "National name for disaster event",
				msg: "National disaster name (if any and applicable)",
			}),
			type: "text",
			uiRow: {},
		},
		{
			key: "glide",
			label: ctx.t({
				code: "disaster_event.glide_number",
				desc: "GLIDE number is a type of ID",
				msg: "GLIDE number",
			}),
			type: "text",
			uiRow: {},
		},
		{
			key: "nameGlobalOrRegional",
			label: ctx.t({
				code: "disaster_event.global_regional_name",
				msg: "Global/regional name",
			}),
			description: ctx.t({
				code: "disaster_event.global_regional_name_description",
				msg: "Disaster event name in global or regional databases (if applicable)",
			}),
			type: "text",
			uiRow: {},
		},
		{
			key: "startDate",
			label: ctx.t({
				code: "common.start_date",
				msg: "Start date",
			}),
			type: "date_optional_precision",
			uiRow: {},
		},
		{
			key: "startDateTime",
			label: ctx.t({
				code: "start_time",
				msg: "Start time",
			}),
			type: "other",
		},
		{
			key: "endDate",
			label: ctx.t({
				code: "common.end_date",
				msg: "End date",
			}),
			type: "date_optional_precision",
		},
		{
			key: "endDateTime",
			label: ctx.t({
				code: "end_time",
				msg: "End time",
			}),
			type: "other",
		},
		{
			key: "startDateLocal",
			label: ctx.t({
				code: "disaster_event.start_date_local",
				msg: "Start date in local format",
			}),
			type: "text",
			uiRow: {},
		},
		{
			key: "endDateLocal",
			label: ctx.t({
				code: "disaster_event.end_date_local",
				msg: "End date in local format",
			}),
			type: "text",
		},
		{
			key: "durationDays",
			label: ctx.t({
				code: "disaster_event.duration_days",
				msg: "Duration (days)",
			}),
			description: ctx.t({
				code: "disaster_event.duration_days_description",
				msg: "Duration (of event direct effects) - in days",
			}),
			type: "number",
			uiRow: {},
		},
		{
			key: "hadOfficialWarningOrWeatherAdvisory",
			label: ctx.t({
				code: "disaster_event.had_official_warning_or_weather_advisory",
				desc: "Label for the warning/advisory boolean field",
				msg: "Was there an officially issued warning and/or weather advisory?",
			}),
			type: "bool",
			uiRow: {
				label: ctx.t({
					code: "common.official_warning",
					desc: "Row label for official warning data",
					msg: "Official Warning",
				}),
			},
		},
		{
			key: "officialWarningAffectedAreas",
			label: ctx.t({
				code: "disaster_event.official_warning_affected_areas",
				desc: "Label for textarea listing areas covered by the warning",
				msg: "Which affected areas were covered by the warning?",
			}),
			type: "textarea",
		},

		...repeatRapidOrPreliminaryAssesments(ctx, 5),

		...repeatPostDisasterAssesments(ctx, 5),
		...repeatOtherAssesments(ctx, 5),

		{
			key: "dataSource",
			label: ctx.t({
				code: "common.data_source",
				msg: "Data source",
			}),
			type: "text",
			uiRow: {
				label: ctx.t({
					code: "common.data_source",
					msg: "Data source",
				}),
			},
		},
		{
			key: "recordingInstitution",
			label: ctx.t({
				code: "disaster_event.recording_institution",
				msg: "Recording institution",
			}),
			type: "text",
		},
		{
			key: "effectsTotalUsd",
			label: ctx.t({
				code: "disaster_event.effects_total_usd",
				desc: "Label for total monetary effects (damages + losses) in USD",
				msg: "Effects (damages + losses) total (in monetary terms - USD)",
			}),
			type: "money",
			uiRow: {
				label: ctx.t({
					code: "disaster_event.effects",
					msg: "Effects",
				}),
			},
		},
		{
			key: "nonEconomicLosses",
			label: ctx.t({
				code: "disaster_event.non_economic_losses",
				msg: "Non-economic losses",
			}),
			type: "textarea",
			uiRow: {},
		},
		{
			key: "damagesSubtotalLocalCurrency",
			label: ctx.t({
				code: "disaster_event.damages_subtotal_local_currency",
				desc: "Label for damages sub‑total in local currency",
				msg: "Damages (sub‑total) - in monetary terms - local currency",
			}),
			type: "money",
			uiRow: {},
		},
		{
			key: "lossesSubtotalUSD",
			label: ctx.t({
				code: "disaster_event.losses_subtotal_usd",
				desc: "Label for losses sub‑total in USD",
				msg: "Losses (sub-total) - in monetary terms - USD",
			}),
			type: "money",
			uiRow: {},
		},
		{
			key: "responseOperationsDescription",
			label: ctx.t({
				code: "disaster_event.response_operations_description",
				desc: "Label for response operations description field",
				msg: "(Emergency) Response operations (description)",
			}),
			type: "textarea",
			uiRow: {},
		},
		{
			key: "responseOperationsCostsLocalCurrency",
			label: ctx.t({
				code: "disaster_event.response_operations_costs_local_currency",
				msg: "Response operations costs (total expenditure, in local currency)",
			}),
			type: "money",
			uiRow: {},
		},
		{
			key: "responseCostTotalLocalCurrency",
			label: ctx.t({
				code: "disaster_event.response_cost_total_local_currency",
				desc: "Label for emergency response cost total in local currency",
				msg: "(Emergency) Response cost - total - in local currency",
			}),
			type: "money",
			uiRow: {},
		},
		{
			key: "responseCostTotalUSD",
			label: ctx.t({
				code: "disaster_event.response_cost_total_usd",
				desc: "Label for emergency response cost total in USD",
				msg: "(Emergency) Response cost - total - in USD",
			}),
			type: "money",
		},
		{
			key: "humanitarianNeedsDescription",
			label: ctx.t({
				code: "disaster_event.humanitarian_needs_description",
				msg: "Humanitarian needs - description",
			}),
			type: "textarea",
			uiRow: {},
		},
		{
			key: "humanitarianNeedsLocalCurrency",
			label: ctx.t({
				code: "disaster_event.humanitarian_needs_local_currency",
				msg: "Humanitarian needs - total in local currency",
			}),
			type: "money",
			uiRow: {},
		},
		{
			key: "humanitarianNeedsUSD",
			label: ctx.t({
				code: "disaster_event.humanitarian_needs_usd",
				msg: "Humanitarian needs - total in USD",
			}),
			type: "money",
		},
		{
			key: "rehabilitationCostsLocalCurrencyOverride",
			label: ctx.t({
				code: "disaster_event.rehabilitation_costs_local_currency_override",
				msg: "Rehabilitation costs - total in local currency",
			}),
			type: "money",
			uiRow: {},
		},
		{
			key: "repairCostsLocalCurrencyOverride",
			label: ctx.t({
				code: "disaster_event.repair_costs_local_currency_override",
				msg: "Repair costs - total in local currency",
			}),
			type: "money",
			uiRow: {},
		},
		{
			key: "replacementCostsLocalCurrencyOverride",
			label: ctx.t({
				code: "disaster_event.replacement_costs_local_currency_override",
				msg: "Replacement costs - total in local currency",
			}),
			type: "money",
			uiRow: {},
		},
		{
			key: "recoveryNeedsLocalCurrencyOverride",
			label: ctx.t({
				code: "disaster_event.recovery_needs_local_currency_override",
				msg: "Recovery needs - total in local currency",
			}),
			type: "money",
			uiRow: {},
		},
		{
			key: "legacyData",
			label: ctx.t({
				code: "common.legacy_data",
				msg: "Legacy data",
			}),
			type: "json",
			uiRow: { colOverride: 1 },
		},
	];
}

export function fieldsDef(ctx: DContext): FormInputDef<DisasterEventFields>[] {
	return [
		{ key: "hazardousEventId", label: "", type: "uuid" },
		{ key: "disasterEventId", label: "", type: "uuid" },
		{ key: "recordingOrganizationId", label: "", type: "uuid" },
		{ key: "hipHazardId", label: "", type: "other", uiRow: { colOverride: 1 } },
		{ key: "hipClusterId", label: "", type: "other" },
		{ key: "hipTypeId", label: "", type: "other" },
		...fieldsDefCommon(ctx),
	];
}

export function fieldsDefApi(
	ctx: DContext,
): FormInputDef<DisasterEventFields>[] {
	return [
		{ key: "hazardousEventId", label: "", type: "uuid" },
		{ key: "disasterEventId", label: "", type: "uuid" },
		{ key: "recordingOrganizationId", label: "", type: "uuid" },
		{ key: "hipHazardId", label: "", type: "other" },
		{ key: "hipClusterId", label: "", type: "other" },
		{ key: "hipTypeId", label: "", type: "other" },
		...fieldsDefCommon(ctx),
		{ key: "apiImportId", label: "", type: "other" },
		{ key: "countryAccountsId", label: "", type: "other" },
	];
}

export function fieldsDefView(
	ctx: DContext,
): FormInputDef<DisasterEventViewModel>[] {
	const commonViewFields = fieldsDefCommon(ctx).map((field) => {
		if (field.key === "startDateTime" || field.key === "endDateTime") {
			return {
				...field,
				type: "text",
			} as FormInputDef<DisasterEventViewModel>;
		}

		return field as FormInputDef<DisasterEventViewModel>;
	});

	return [
		{
			key: "hazardousEventId",
			label: ctx.t({
				code: "hazardous_event",
				msg: "Hazardous event",
			}),
			type: "uuid",
		},
		{ key: "disasterEventId", label: "", type: "uuid" },
		{ key: "hipHazard", label: "", type: "other" },
		...commonViewFields,
		{ key: "createdAt", label: "", type: "other" },
		{ key: "updatedAt", label: "", type: "other" },
	];
}

export function disasterEventLabel(args: { id?: string }): string {
	let parts: string[] = [];
	if (args.id) {
		parts.push(args.id.slice(0, 5));
	}
	return parts.join(" ");
}

export function disasterEventLink(
	ctx: ViewContext,
	args: {
		id: string;
	},
) {
	return (
		<LangLink lang={ctx.lang} to={`/disaster-event/${args.id}`}>
			{disasterEventLabel(args)}
		</LangLink>
	);
}

interface DisasterEventFormProps extends UserFormProps<DisasterEventFields> {
	divisionGeoJSON?: any;
	hip: Hip;
	hazardousEvent?: HazardousEventPickerType | null;
	disasterEvent?: DisasterEventBasicInfoViewModel | null;
	treeData: any[];
	ctryIso3: string;
	usersWithValidatorRole?: any[];
}

export function DisasterEventForm(props: DisasterEventFormProps) {
	const ctx = props.ctx;
	const fields = props.fields;
	const spatialFootprint = (fields as any)?.spatialFootprint ?? [];

	const [selectedHazardousEvent, setSelectedHazardousEvent] = useState(
		props.hazardousEvent,
	);

	const [selectedDisasterEvent, setSelectedDisasterEvent] = useState(
		props.disasterEvent,
	);
	// const [selected, setSelected] = useState(props.parent);
	//const [selectedUserValidator, setSelectedUserValidator] = useState<UserValidator | null>(null);
	const [selectedAction, setSelectedAction] = useState<string>("submit-draft");
	selectedAction; // To avoid unused variable warning

	// How to set default selected users with validator role
	// const [selectedUserValidator, setSelectedUserValidator] = useState<UserValidator | null>([
	// 	usersWithValidatorRole[1], // Example user
	//  usersWithValidatorRole[3]  // Example user
	// ]);
	const usersWithValidatorRole: any[] =
		props.usersWithValidatorRole?.map((user: any) => ({
			name: user.firstName + " " + user.lastName,
			id: user.id,
			email: user.email,
		})) || [];
	// console.log(
	// 	selectedCities.map((c) => c.name).join(", ")
	// );

	const handleSubmitAction = (action: SaveAction, validatorIds?: string) => {
		// Set the hidden fields before submitting the main form
		const tempActionField = document.getElementById(
			"tempAction",
		) as HTMLInputElement;
		if (tempActionField) {
			tempActionField.value = action;
		}

		const tempValidatorField = document.getElementById(
			"tempValidatorUserIds",
		) as HTMLInputElement;
		if (tempValidatorField) {
			tempValidatorField.value = validatorIds || "";
		}

		// Submit the form
		let frmElement = null;
		if (props.id) {
			frmElement = document.getElementById(props.id) as HTMLFormElement | null;
		} else {
			frmElement = document.getElementById(
				"form-new",
			) as HTMLFormElement | null;
		}

		if (frmElement) {
			if (!frmElement.checkValidity()) {
				// Show native validation tooltips; keep the modal open so they stay visible
				frmElement.reportValidity();
				return;
			}
			// Form is valid — close the modal then submit
			setVisibleModalSubmit(false);
			frmElement.requestSubmit();
			return;
		}

		// Close the modal
		setVisibleModalSubmit(false);
	};

	const overrideSubmitButton = (
		<>
			<button
				type="button"
				className="mg-button mg-button-primary"
				onClick={(e: any) => {
					e.preventDefault();
					setVisibleModalSubmit(true);
				}}
				style={
					{
						// display: "none"
					}
				}
			>
				{ctx.t({
					code: "common.savesubmit",
					desc: "Label for save submit action",
					msg: "Save or submit",
				})}
			</button>
			<button
				type="button"
				className="mg-button mg-button-system"
				onClick={(e: any) => {
					e.preventDefault();
					setVisibleModalDiscard(true);
				}}
				style={
					{
						// display: "none"
					}
				}
			>
				{ctx.t({
					code: "common.discard",
					desc: "Label for disregard action",
					msg: "Discard",
				})}
			</button>
		</>
	);

	const [visibleModalSubmit, setVisibleModalSubmit] = useState<boolean>(false);
	const [visibleModalDiscard, setVisibleModalDiscard] =
		useState<boolean>(false);
	const btnRefSubmit = useRef(null);

	useEffect(() => {
		const handleMessage = (event: any) => {
			if (event.data?.type === "select_hazard") {
				if (event.data?.selected) {
					setSelectedHazardousEvent(event.data.selected);
				}
			}
			if (event.data?.type === "select_disaster") {
				if (event.data?.selected) {
					setSelectedDisasterEvent(event.data.selected);
				}
			}
		};
		window.addEventListener("message", handleMessage);
		return () => {
			window.removeEventListener("message", handleMessage);
		};
	}, [props.id]);

	const treeData = props.treeData;
	const ctryIso3 = props.ctryIso3;
	const divisionGeoJSON = props.divisionGeoJSON;

	let hazardousEventLinkInitial: "none" | "hazardous_event" | "disaster_event" =
		"none";
	if (props.fields.hazardousEventId) {
		hazardousEventLinkInitial = "hazardous_event";
	} else if (props.fields.disasterEventId) {
		hazardousEventLinkInitial = "disaster_event";
	}

	const [hazardousEventLinkType, setHazardousEventLinkType] = useState(
		hazardousEventLinkInitial,
	);

	let calculationOverrides: Record<string, ReactElement | undefined | null> =
		{};

	let names = ["rehabilitation", "repair", "replacement", "recovery"];
	let initialOverrides: Record<string, boolean> = {};
	for (let name of names) {
		let mod = name != "recovery" ? "Costs" : "Needs";
		let nameOverride = name + mod + "LocalCurrencyOverride";
		let valueOverride = (props.fields as any)[nameOverride] as string;
		initialOverrides[nameOverride] =
			typeof valueOverride == "string" && valueOverride != "";
	}

	let [overrides, setOverrides] = useState(initialOverrides);
	for (let name of names) {
		let mod = name != "recovery" ? "Costs" : "Needs";
		let nameOverride = name + mod + "LocalCurrencyOverride";
		let nameCalc = name + mod + "LocalCurrencyCalc";
		let valueOverride = (props.fields as any)[nameOverride] as string;
		let valueCalc = (props.fields as any)[nameCalc] as string;
		//	let value = (valueOverride !== "" && valueOverride !== null) ? valueOverride : valueCalc
		//if (value === "" || value === null) {
		//value = "0"
		//}
		let fields = fieldsDef(ctx);
		let def = fields.find((d) => d.key == nameOverride);
		if (!def) throw new Error("def not found for: " + nameOverride);

		let errors: any = null;
		if (props.errors?.fields) {
			let fe = props.errors.fields as any;
			errors = fe[nameOverride];
		}

		const handleCheckboxChange = (
			event: React.ChangeEvent<HTMLInputElement>,
		) => {
			setOverrides((prevOverrides) => ({
				...prevOverrides,
				[nameOverride]: event.target.checked,
			}));
		};

		calculationOverrides[nameOverride] = (
			<>
				<WrapInput
					def={def}
					child={
						<>
							{overrides[nameOverride] ? (
								<input
									type="text"
									inputMode="numeric"
									pattern="[0-9]*"
									name={nameOverride}
									defaultValue={valueOverride}
								/>
							) : (
								<>
									<input type="hidden" name={nameOverride} value="" />
									<input type="text" disabled value={valueCalc} />
								</>
							)}
						</>
					}
					errors={errors}
				/>
				<WrapInputBasic
					label={ctx.t({
						code: "common.override_input",
						desc: "Label for checkbox that allows inputing manual calculation (overriding) instead of using auto calculated ones",
						msg: "Override",
					})}
					child={
						<input
							type="checkbox"
							checked={overrides[nameOverride] || false}
							onChange={handleCheckboxChange}
						></input>
					}
				/>
			</>
		);
	}

	// Modal submit validation function
	function validateBeforeSubmit(
		selectedAction: string,
		selectedUserValidator: UserValidator | null,
	): boolean {
		// Set the hidden fields before submitting the main form
		const tempActionField = document.getElementById(
			"tempAction",
		) as HTMLInputElement;
		if (tempActionField) {
			tempActionField.value = selectedAction;
		}
		const tempValidatorField = document.getElementById(
			"tempValidatorUserIds",
		) as HTMLInputElement;
		if (tempValidatorField) {
			tempValidatorField.value = "";
		}

		// Require at least one validator
		if (selectedAction === "submit-validation") {
			// Extract just the IDs and join them as comma-separated string
			const validatorIds = Array.isArray(selectedUserValidator)
				? selectedUserValidator.map((c) => c.id).join(",")
				: selectedUserValidator?.id || "";

			//const validatorField = document.getElementById("tableValidatorUserIds") as HTMLInputElement;
			if (tempValidatorField) {
				tempValidatorField.value = validatorIds;
			}

			// return false;
		}
		// Add more validation as needed
		let frmElement = null;
		if (props.id) {
			frmElement = document.getElementById(props.id) as HTMLFormElement | null;
		} else {
			frmElement = document.getElementById(
				"form-new",
			) as HTMLFormElement | null;
		}

		if (frmElement) {
			if (!frmElement.checkValidity()) {
				// Show native validation tooltips; keep the modal open so they stay visible
				frmElement.reportValidity();
				return false;
			}
			// Form is valid — close the modal then submit
			setVisibleModalSubmit(false);
			frmElement.requestSubmit();
			return true;
		}
		return true;
	}

	const footerDialogDiscard = (
		<>
			<div>
				<Button
					ref={btnRefSubmit}
					className="mg-button mg-button-primary"
					label={ctx.t({ code: "common.save_draft", msg: "Save as draft" })}
					style={{ width: "100%" }}
					onClick={() => {
						setSelectedAction("submit-draft");
						if (validateBeforeSubmit("submit-draft", null)) {
							setVisibleModalDiscard(false);
						}
					}}
				/>
			</div>
			<div style={{ marginTop: "10px" }}>
				<Button
					ref={btnRefSubmit}
					className="mg-button mg-button-outline"
					label={ctx.t({
						code: "common.discard_work_and_exit",
						msg: "Discard work and exit",
					})}
					style={{ width: "100%" }}
					onClick={() => {
						document.location.href = ctx.url("/disaster-event");
					}}
					autoFocus
				/>
			</div>
		</>
	);

	return (
		<>
			<div className="card flex justify-content-center">
				<Dialog
					visible={visibleModalDiscard}
					modal
					header={ctx.t({
						code: "common.exit_confirmation",
						msg: "Are you sure you want to exit?",
					})}
					footer={footerDialogDiscard}
					style={{ width: "50rem" }}
					onHide={() => {
						if (!visibleModalDiscard) return;
						setVisibleModalDiscard(false);
					}}
				>
					<div>
						<p>
							{ctx.t({
								code: "common.unsaved_changes_warning",
								msg: "If you leave this page, your work will not be saved.",
							})}
						</p>
					</div>
				</Dialog>

				<SaveSubmitDialog
					ctx={ctx}
					visible={visibleModalSubmit}
					onHide={() => setVisibleModalSubmit(false)}
					onSubmit={handleSubmitAction}
					usersWithValidatorRole={usersWithValidatorRole}
					userRole={ctx.user?.role}
				/>
			</div>
			<FormView
				ctx={ctx}
				user={props.user}
				path={route}
				edit={props.edit}
				id={props.id}
				title={ctx.t({
					code: "disaster_events",
					msg: "Disaster events",
				})}
				editLabel={ctx.t({
					code: "disaster_event.edit",
					msg: "Edit disaster event",
				})}
				addLabel={ctx.t({
					code: "disaster_event.add",
					msg: "Add disaster event",
				})}
				errors={props.errors}
				fields={props.fields}
				fieldsDef={fieldsDef(ctx)}
				hiddenFields={
					<>
						<input
							type="hidden"
							id="tempValidatorUserIds"
							name="tempValidatorUserIds"
						/>
						<input type="hidden" id="tempAction" name="tempAction" />
					</>
				}
				infoNodes={
					<>
						<div className="mg-grid mg-grid__col-3">
							<WrapInputBasic
								label={ctx.t({
									code: "disaster_event.linking_parameter",
									msg: "Linking parameter",
								})}
								child={
									<select
										defaultValue={hazardousEventLinkType}
										onChange={(e: any) =>
											setHazardousEventLinkType(e.target.value)
										}
									>
										<option value="none">
											{ctx.t({
												code: "common.no_link",
												desc: "No link between records",
												msg: "No link",
											})}
										</option>
										<option value="hazardous_event">
											{ctx.t({
												code: "hazardous_event",
												msg: "Hazardous event",
											})}
										</option>
										<option value="disaster_event">
											{ctx.t({
												code: "disaster_event",
												msg: "Disaster event",
											})}
										</option>
									</select>
								}
							/>
						</div>
					</>
				}
				overrideSubmitMainForm={overrideSubmitButton}
				override={{
					...calculationOverrides,
					hazardousEventId:
						hazardousEventLinkType == "hazardous_event" ? (
							<Field
								key="hazardousEventId"
								label={ctx.t({
									code: "hazardous_event",
									msg: "Hazardous event",
								})}
							>
								{selectedHazardousEvent
									? hazardousEventLink(ctx, selectedHazardousEvent)
									: "-"}
								&nbsp;
								<LangLink
									lang={ctx.lang}
									target="_blank"
									rel="opener"
									to={"/hazardous-event/picker"}
								>
									{ctx.t({
										code: "common.change",
										msg: "Change",
									})}
								</LangLink>
								<input
									type="hidden"
									name="hazardousEventId"
									value={selectedHazardousEvent?.id || ""}
								/>
								<FieldErrors
									errors={props.errors}
									field="hazardousEventId"
								></FieldErrors>
							</Field>
						) : (
							<input type="hidden" name="hazardousEventId" value="" />
						),
					disasterEventId:
						hazardousEventLinkType == "disaster_event" ? (
							<Field
								key="disasterEventId"
								label={ctx.t({
									code: "disaster_event",
									msg: "Disaster event",
								})}
							>
								{selectedDisasterEvent
									? disasterEventLink(ctx, selectedDisasterEvent)
									: "-"}
								&nbsp;
								<LangLink
									lang={ctx.lang}
									target="_blank"
									rel="opener"
									to={"/disaster-event/picker"}
								>
									{ctx.t({
										code: "common.change",
										msg: "Change",
									})}
								</LangLink>
								<input
									type="hidden"
									name="disasterEventId"
									value={selectedDisasterEvent?.id || ""}
								/>
								<FieldErrors
									errors={props.errors}
									field="disasterEventId"
								></FieldErrors>
							</Field>
						) : (
							<input type="hidden" name="disasterEventId" value="" />
						),
					hipTypeId: null,
					hipClusterId: null,
					hipHazardId: (
						<Field
							key="hazardId"
							label={ctx.t({
								code: "hip.hazard_classification",
								msg: "Hazard classification",
							})}
						>
							<HazardPicker
								ctx={ctx}
								hip={props.hip}
								typeId={fields.hipTypeId}
								clusterId={fields.hipClusterId}
								hazardId={fields.hipHazardId}
							/>
							<FieldErrors
								errors={props.errors}
								field="hipHazardId"
							></FieldErrors>
						</Field>
					),
					spatialFootprint: props.edit ? (
						<Field key="spatialFootprint" label="">
							<SpatialFootprintFormView
								ctx={ctx}
								divisions={divisionGeoJSON}
								ctryIso3={ctryIso3 || ""}
								treeData={treeData ?? []}
								initialData={spatialFootprint}
							/>
						</Field>
					) : (
						<Field key="spatialFootprint" label="">
							<></>
						</Field>
					),
				}}
			/>
		</>
	);
}

interface DisasterEventViewProps {
	ctx: ViewContext;
	item: DisasterEventViewModel;
	isPublic: boolean;
	auditLogs?: any[];
}

export function DisasterEventView(props: DisasterEventViewProps) {
	const ctx = props.ctx;
	const { item } = props;

	const itemAny = item as any;
	const formatReviewDate = (value: unknown): string => {
		if (!value) {
			return "-";
		}
		const formatted = formatDate(value as any);
		return formatted || "-";
	};
	const formatReviewDateTime = (
		dateValue: unknown,
		timeValue: unknown,
	): string => {
		const dateText = formatReviewDate(dateValue);
		const timeText =
			typeof timeValue === "string" && timeValue.trim().length > 0
				? timeValue.trim().slice(0, 5)
				: "-";
		return `${dateText} at ${timeText}`;
	};
	const hipName = (value: any): string => {
		if (!value) {
			return "";
		}
		if (typeof value?.name === "string") {
			return value.name;
		}
		if (value?.name && typeof value.name === "object") {
			return (value.name?.en ||
				Object.values(value.name).find((v) => typeof v === "string") ||
				"") as string;
		}
		return "";
	};
	const selectedDivisionItems = ((itemAny?.spatialFootprint as any[]) || [])
		.filter((entry) => entry?.map_option === "Geographic level")
		.map((entry, index) => ({
			key:
				typeof entry?.id === "string" && entry.id.length > 0
					? entry.id
					: `division-${index}`,
			label:
				typeof entry?.geographic_level === "string" &&
				entry.geographic_level.trim().length > 0
					? entry.geographic_level
					: typeof entry?.title === "string"
						? entry.title
						: "",
		}));
	const reviewSpatialFootprintItems = (
		(itemAny?.spatialFootprint as any[]) || []
	)
		.filter((entry) => {
			const mapOption =
				typeof entry?.map_option === "string" ? entry.map_option : "";
			if (mapOption === "Geographic level") {
				return false;
			}
			if (mapOption === "Map coordinates") {
				return true;
			}
			return Boolean(entry?.geojson);
		})
		.map((entry, index) => {
			const title = typeof entry?.title === "string" ? entry.title.trim() : "";
			return title || `Spatial footprint ${index + 1}`;
		});
	const buildAttachmentViewerName = (attachment: any): string => {
		const eventId = String(itemAny?.id || "").trim();
		const rawFileKey = String(attachment?.fileKey || "").trim();
		const rawFileName = String(
			attachment?.fileName || attachment?.name || "Attachment",
		).trim();

		if (!eventId) {
			return rawFileName;
		}

		if (!rawFileKey) {
			return `${eventId}/${rawFileName}`;
		}

		const normalized = rawFileKey.replace(/\\/g, "/");
		const exactMarker = `/disaster-event/${eventId}/`;
		const exactMarkerIndex = normalized.lastIndexOf(exactMarker);
		if (exactMarkerIndex >= 0) {
			const fileNameOnly = normalized.slice(
				exactMarkerIndex + exactMarker.length,
			);
			return `${eventId}/${fileNameOnly}`;
		}

		const genericMatch = normalized.match(/\/disaster-event\/([^/]+)\/(.+)$/);
		if (genericMatch) {
			return `${genericMatch[1]}/${genericMatch[2]}`;
		}

		const cleaned = normalized.replace(/^\/+/, "");
		if (cleaned.startsWith(`${eventId}/`)) {
			return cleaned;
		}

		const parts = cleaned.split("/").filter(Boolean);
		const baseName = parts.length > 0 ? parts[parts.length - 1] : rawFileName;
		return `${eventId}/${baseName}`;
	};
	const reviewAttachments = ((itemAny?.attachments as any[]) || []).map(
		(attachment: any, index: number) => ({
			id: String(attachment?.id || `attachment-${index}`),
			fileName: String(
				attachment?.fileName || attachment?.name || "Attachment",
			),
			fileKey: String(attachment?.fileKey || ""),
			href: ctx.url(
				`${route}/file-viewer?name=${encodeURIComponent(
					buildAttachmentViewerName(attachment),
				)}`,
			),
			fileType: attachment?.fileType,
			fileSize:
				typeof attachment?.fileSize === "number"
					? attachment.fileSize
					: undefined,
		}),
	);
	const reviewLinks = ((itemAny?.links as any[]) || []).map(
		(link: any, index: number) => ({
			id: String(link?.id || `link-${index}`),
			url: String(link?.url || ""),
			title: String(link?.title || ""),
		}),
	);
	const responseAttachmentCountByResponseId = (
		(itemAny?.responseAttachments as any[]) || []
	)
		.filter(
			(attachment: any) =>
				typeof attachment?.disasterEventResponseId === "string" &&
				attachment.disasterEventResponseId.trim().length > 0,
		)
		.reduce<Record<string, number>>((counts, attachment: any) => {
			const responseId = String(attachment.disasterEventResponseId);
			counts[responseId] = (counts[responseId] ?? 0) + 1;
			return counts;
		}, {});
	const responseAttachmentsByResponseId = (
		(itemAny?.responseAttachments as any[]) || []
	)
		.filter(
			(attachment: any) =>
				typeof attachment?.disasterEventResponseId === "string" &&
				attachment.disasterEventResponseId.trim().length > 0,
		)
		.reduce<Record<string, any[]>>(
			(grouped, attachment: any, index: number) => {
				const responseId = String(attachment.disasterEventResponseId);
				const existing = grouped[responseId] ?? [];
				existing.push({
					id: String(attachment?.id || `${responseId}-attachment-${index}`),
					title: String(
						attachment?.title || attachment?.fileName || "Attachment",
					),
					fileKey: String(attachment?.fileKey || ""),
					fileName: String(
						attachment?.fileName || attachment?.name || "Attachment",
					),
					fileType: attachment?.fileType,
					fileSize:
						typeof attachment?.fileSize === "number" ? attachment.fileSize : 0,
					href: ctx.url(
						`${route}/file-viewer?name=${encodeURIComponent(
							buildAttachmentViewerName(attachment),
						)}`,
					),
				});
				grouped[responseId] = existing;
				return grouped;
			},
			{},
		);
	const declarationAttachmentCountByDeclarationId = (
		(itemAny?.declarationAttachments as any[]) || []
	)
		.filter(
			(attachment: any) =>
				typeof attachment?.disasterEventDeclarationId === "string" &&
				attachment.disasterEventDeclarationId.trim().length > 0,
		)
		.reduce<Record<string, number>>((counts, attachment: any) => {
			const declarationId = String(attachment.disasterEventDeclarationId);
			counts[declarationId] = (counts[declarationId] ?? 0) + 1;
			return counts;
		}, {});
	const declarationAttachmentsByDeclarationId = (
		(itemAny?.declarationAttachments as any[]) || []
	)
		.filter(
			(attachment: any) =>
				typeof attachment?.disasterEventDeclarationId === "string" &&
				attachment.disasterEventDeclarationId.trim().length > 0,
		)
		.reduce<Record<string, any[]>>(
			(grouped, attachment: any, index: number) => {
				const declarationId = String(attachment.disasterEventDeclarationId);
				const existing = grouped[declarationId] ?? [];
				existing.push({
					id: String(attachment?.id || `${declarationId}-attachment-${index}`),
					title: String(
						attachment?.title || attachment?.fileName || "Attachment",
					),
					fileKey: String(attachment?.fileKey || ""),
					fileName: String(
						attachment?.fileName || attachment?.name || "Attachment",
					),
					fileType: attachment?.fileType,
					fileSize:
						typeof attachment?.fileSize === "number" ? attachment.fileSize : 0,
					href: ctx.url(
						`${route}/file-viewer?name=${encodeURIComponent(
							buildAttachmentViewerName(attachment),
						)}`,
					),
				});
				grouped[declarationId] = existing;
				return grouped;
			},
			{},
		);

	const normalizedResponses = ((itemAny?.responses as any[]) || []).map(
		(response: any, index: number) => {
			const responseId = String(response?.id || `response-${index + 1}`);
			const responseType = String(
				response?.responseType ?? response?.type ?? "",
			).trim();
			const description = String(response?.description ?? "").trim();
			const coverage = String(response?.coverage ?? "").trim();

			return {
				id: responseId,
				type: responseType,
				date: formatReviewDate(response?.responseDate),
				coverage,
				description,
				attachmentCount: responseAttachmentCountByResponseId[responseId] ?? 0,
				attachments: responseAttachmentsByResponseId[responseId] ?? [],
			};
		},
	);

	const legacyResponses = Array.from({ length: 5 }).flatMap((_, index) => {
		const n = index + 1;
		const description = itemAny?.[`earlyActionDescription${n}`];
		if (!description || String(description).trim().length === 0) {
			return [];
		}
		return [
			{
				id: `response-early-action-${n}`,
				type: "early_action",
				date: formatReviewDate(itemAny?.[`earlyActionDate${n}`]),
				description: String(description),
			},
		];
	});
	if (
		typeof itemAny?.responseOperationsDescription === "string" &&
		itemAny.responseOperationsDescription.trim().length > 0
	) {
		legacyResponses.push({
			id: "response-operation-1",
			type: "response_operation",
			date: "",
			description: itemAny.responseOperationsDescription,
		});
	}

	const responses =
		normalizedResponses.length > 0 ? normalizedResponses : legacyResponses;

	const assessmentAttachmentsByAssessmentId = (
		(itemAny?.assessmentAttachments as any[]) || []
	).reduce(
		(accumulator, attachment: any) => {
			const assessmentId = String(attachment?.disasterEventAssessmentId || "");
			if (!assessmentId) {
				return accumulator;
			}
			const existing = accumulator[assessmentId] || [];
			existing.push({
				id: String(attachment?.id || ""),
				title: String(attachment?.title || attachment?.fileName || ""),
				fileName: String(attachment?.fileName || ""),
				fileKey: String(attachment?.fileKey || ""),
				fileType: String(attachment?.fileType || ""),
				fileSize: Number(attachment?.fileSize || 0),
			});
			accumulator[assessmentId] = existing;
			return accumulator;
		},
		{} as Record<string, any[]>,
	);

	const assessmentSectorsByAssessmentId = (
		(itemAny?.assessmentSectors as any[]) || []
	).reduce(
		(accumulator, link: any) => {
			const assessmentId = String(link?.disasterEventAssessmentId || "");
			const sectorId = String(link?.sectorId || "");
			if (!assessmentId || !sectorId) {
				return accumulator;
			}
			const existing = accumulator[assessmentId] || [];
			existing.push(sectorId);
			accumulator[assessmentId] = existing;
			return accumulator;
		},
		{} as Record<string, string[]>,
	);

	const assessments = ((itemAny?.assessments as any[]) || []).map(
		(assessment: any, index: number) => {
			const assessmentId = String(assessment?.id || `assessment-${index + 1}`);
			const coverage = String(assessment?.coverage ?? "").trim();
			const description = String(assessment?.description ?? "").trim();
			const otherSectors = String(assessment?.otherSectors ?? "").trim();
			const sectorIds = assessmentSectorsByAssessmentId[assessmentId] || [];

			const descriptionParts = [
				sectorIds.length > 0 ? `Sectors: ${sectorIds.join(", ")}` : "",
				otherSectors ? `Other sectors: ${otherSectors}` : "",
				description,
			].filter((value) => value.trim().length > 0);

			return {
				id: assessmentId,
				type: String(assessment?.assessmentType || "Assessment"),
				date: formatReviewDate(assessment?.assessmentDate),
				coverage,
				description: descriptionParts.join("\n"),
				attachments: assessmentAttachmentsByAssessmentId[assessmentId] || [],
			};
		},
	);

	const normalizedDeclarations = ((itemAny?.declarations as any[]) || []).map(
		(declaration: any, index: number) => {
			const declarationId = String(
				declaration?.id || `declaration-${index + 1}`,
			);
			const declarationType = String(declaration?.type ?? "").trim();
			const effects = String(declaration?.effects ?? "").trim();
			const coverage = String(declaration?.coverage ?? "").trim();
			const declarationStatus = String(
				declaration?.declarationStatus ?? "",
			).trim();
			const issuingOrganization = String(
				declaration?.issuingOrganization ?? "",
			).trim();

			return {
				id: declarationId,
				type: declarationType || "Declaration",
				date: formatReviewDate(declaration?.declarationDate),
				coverage,
				description: effects,
				meta: {
					declarationStatusId: declaration?.declarationStatusId ?? undefined,
					declarationStatus: declarationStatus || undefined,
					issuingOrganization: issuingOrganization || undefined,
				},
				attachmentCount:
					declarationAttachmentCountByDeclarationId[declarationId] ?? 0,
				attachments: declarationAttachmentsByDeclarationId[declarationId] ?? [],
			};
		},
	);

	const legacyDeclarations: {
		id: string;
		type: string;
		date: string;
		description: string;
		meta?: {
			declarationStatus?: string;
		};
	}[] = [
		...Array.from({ length: 5 }).flatMap((_, index) => {
			const n = index + 1;
			const description = itemAny?.[`disasterDeclarationTypeAndEffect${n}`];
			if (!description || String(description).trim().length === 0) {
				return [];
			}
			return [
				{
					id: `declaration-effect-${n}`,
					type: "disaster_declaration_effects",
					date: formatReviewDate(itemAny?.[`disasterDeclarationDate${n}`]),
					description: String(description),
				},
			];
		}),
	];
	if (typeof itemAny?.disasterDeclaration === "string") {
		legacyDeclarations.push({
			id: "declaration-status-1",
			type: "disaster_declaration",
			date: "",
			description: "",
			meta: {
				declarationStatus: itemAny.disasterDeclaration,
			},
		});
	}
	const declarations =
		normalizedDeclarations.length > 0
			? normalizedDeclarations
			: legacyDeclarations;

	const getDetailTypeLabel = (value: string) => {
		switch (value) {
			case "early_action":
				return "Early action";
			case "response_operation":
				return "Response operation";
			case "rapid_preliminary_assessment":
				return "Rapid/Preliminary assessment";
			case "post_disaster_assessment":
				return "Post-disaster assessment";
			case "other_assessment":
				return "Other assessment";
			case "disaster_declaration":
				return "Disaster declaration";
			case "disaster_declaration_effects":
				return "Disaster declaration effects";
			case "official_warning":
				return "Official warning";
			default:
				return value;
		}
	};

	const getDetailDescriptionValue = (detail: any): string => {
		if (detail?.type === "disaster_declaration") {
			return detail?.meta?.declarationStatus || "";
		}
		if (
			typeof detail?.coverage === "string" &&
			detail.coverage.trim().length > 0
		) {
			return [
				`Coverage: ${detail.coverage.trim()}`,
				typeof detail?.description === "string" ? detail.description : "",
			]
				.filter((value) => value.trim().length > 0)
				.join("\n");
		}
		return detail?.description || "";
	};

	return (
		<ViewComponentMainDataCollection
			approvalStatus={item?.approvalStatus}
			ctx={props.ctx}
			isPublic={props.isPublic}
			path={route}
			id={item.id}
			returnAssigneeOptions={(item as any).returnAssignees}
			hideTopSummary={true}
			hideEditButton={true}
			extraInfo={
				<div className="mb-4">
					<Button
						type="button"
						outlined
						icon="pi pi-arrow-left"
						iconPos="left"
						label={ctx.t({
							code: "disaster_events.back_to_list",
							msg: "Back to Disaster events",
						})}
						className="p-button-sm"
						onClick={() => {
							document.location.href = ctx.url(route);
						}}
					/>
				</div>
			}
			title={ctx.t({
				code: "disaster_events",
				msg: "Disaster events",
			})}
		>
			<DisasterEventReviewStep
				form={{
					nameNational: itemAny?.nameNational || "",
					nameGlobalOrRegional: itemAny?.nameGlobalOrRegional || "",
					nationalDisasterId: itemAny?.nationalDisasterId || "",
					glide: itemAny?.glide || "",
					id: itemAny?.id || "",
					recordingOrganizationName:
						itemAny?.recordingInstitution || itemAny?.recordOriginator || "",
				}}
				selectedHazardTypeName={hipName(itemAny?.hipType)}
				selectedHazardClusterName={hipName(itemAny?.hipCluster)}
				selectedSpecificHazardName={hipName(itemAny?.hipHazard)}
				startTimingValue={formatReviewDateTime(
					itemAny?.startDate,
					itemAny?.startDateTime,
				)}
				endTimingValue={formatReviewDateTime(
					itemAny?.endDate,
					itemAny?.endDateTime,
				)}
				selectedDivisionItems={selectedDivisionItems}
				reviewSpatialFootprintItems={reviewSpatialFootprintItems}
				reviewSpatialFootprintData={(itemAny?.spatialFootprint as any[]) || []}
				reviewLinks={reviewLinks}
				reviewAttachments={reviewAttachments}
				triggeringHazardousEventTarget={[]}
				triggeredHazardousEventTarget={[]}
				triggeringDisasterEventTarget={[]}
				triggeredDisasterEventTarget={[]}
				linkedDisasterRecordTarget={[]}
				responses={responses}
				assessments={assessments}
				declarations={declarations}
				getDetailTypeLabel={getDetailTypeLabel}
				getDetailDescriptionValue={getDetailDescriptionValue}
				showHeader={false}
				showActions={false}
				onCancel={() => undefined}
				onBack={() => undefined}
				onSendForValidation={() => undefined}
			/>
		</ViewComponentMainDataCollection>
	);
}
