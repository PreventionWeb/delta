import { useRef, useState } from "react";
import { Form, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useViewContext } from "~/frontend/context";
import {
	HAZARDOUS_EVENT_STATUS_VALUES,
	type HazardousEventAttachmentProps,
	type HazardousEventStatus,
} from "~/domains/hazardous-events/domain/HazardousEvent";
import type { HazardTaxonomyOptions } from "~/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase";
import type { ValidatorCandidate } from "~/domains/validation-workflow/application/ports/IValidatorCandidateRepository";
import { HazardousEventFormField } from "./HazardousEventFormField";
import { HazardousEventFlexibleDateField } from "./HazardousEventFlexibleDateField";
import { HazardousEventHazardPicker } from "./HazardousEventHazardPicker";
import { HazardousEventParentField } from "./HazardousEventParentField";
import {
	HazardousEventSaveSubmitModal,
	type SaveAction,
} from "./HazardousEventSaveSubmitModal";
import { HazardousEventDiscardModal } from "./HazardousEventDiscardModal";
import { useLiveFormValidity } from "./useLiveFormValidity";
import { AttachmentsFormView } from "~/frontend/attachmentsFormView";
import { workflowStatusDisplay } from "./workflowStatusDisplay";
import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";
import { Link } from "~/design-system/components/Link";

export interface HazardousEventFormInitialValues {
	specificHazardId: string;
	startDate: string;
	endDate: string;
	nationalSpecification: string;
	description: string;
	chainsExplanation: string;
	magnitude: string;
	recordOriginator: string;
	dataSource: string;
	hazardousEventStatus: HazardousEventStatus | null;
	attachments: readonly HazardousEventAttachmentProps[];
}

export interface HazardousEventFormPageProps {
	mode: "create" | "edit";
	taxonomyOptions: HazardTaxonomyOptions;
	validatorCandidates: readonly ValidatorCandidate[];
	parent: { id: string; displayName: string } | null;
	role?: string | null;
	fieldErrors?: Record<string, string[]>;
	initialValues?: HazardousEventFormInitialValues;
	partialFailure?: boolean;
	/** Null on create (no WorkflowInstance yet) or for a DEF-031 legacy row. Display-only --
	 * the action never reads this field. */
	workflowStatus?: Status | null;
}

/** Create route's own default only (edit always passes the real stored event, never
 * overridden). `"ongoing"` is deliberate (legacy defaults to `"forecasted"` -- design.md). */
const EMPTY_VALUES: HazardousEventFormInitialValues = {
	specificHazardId: "",
	startDate: "",
	endDate: "",
	nationalSpecification: "",
	description: "",
	chainsExplanation: "",
	magnitude: "",
	recordOriginator: "",
	dataSource: "",
	hazardousEventStatus: "ongoing",
	attachments: [],
};

/** Full create/edit form (design.md Decision 9). Both routes render this; mode only
 * distinguishes the submit-time redirect target, handled by the route's own action. */
export function HazardousEventFormPage({
	mode,
	taxonomyOptions,
	validatorCandidates,
	parent,
	role = null,
	fieldErrors,
	initialValues = EMPTY_VALUES,
	partialFailure = false,
	workflowStatus = null,
}: HazardousEventFormPageProps) {
	const { t } = useTranslation("hazardous-events");
	const ctx = useViewContext();
	const navigate = useNavigate();
	const formRef = useRef<HTMLFormElement>(null);
	const [tempAction, setTempAction] = useState<string>("");
	const [tempValidatorUserIds, setTempValidatorUserIds] = useState<string>("");
	const [saveSubmitOpen, setSaveSubmitOpen] = useState(false);
	const [discardOpen, setDiscardOpen] = useState(false);
	const isFormValid = useLiveFormValidity(formRef);

	function submitWithAction(
		action: SaveAction,
		validatorUserIds: readonly string[],
	) {
		setTempAction(action);
		setTempValidatorUserIds(validatorUserIds.join(","));
		setSaveSubmitOpen(false);
		// Deferred so React has committed the hidden-field state above before the real submit
		// reads it; requestSubmit() (not submit()) preserves native required-field validation.
		queueMicrotask(() => formRef.current?.requestSubmit());
	}

	return (
		<>
			{partialFailure && (
				<div className="dts-form-component" role="alert">
					{t("form.partial_transition_failed")}
				</div>
			)}
			{/* Breadcrumb + page-specific h2 -- legacy's own FormView markup, sibling to (not
			 * inside) the form (design.md Decision 9 Addendum 2, Gap 2). */}
			<section className="dts-page-section">
				<p>
					<Link href={ctx.url("/he-preview")}>{t("title")}</Link>
				</p>
				<h2>
					{mode === "edit" ? t("form.edit_title") : t("form.create_title")}
				</h2>
			</section>
			<Form method="post" ref={formRef} className="dts-form">
				<HazardousEventParentField
					initialParent={parent}
					errors={fieldErrors?.causeId}
				/>

				<HazardousEventHazardPicker
					taxonomyOptions={taxonomyOptions}
					initialSpecificHazardId={initialValues.specificHazardId}
					errors={fieldErrors?.specificHazardId}
				/>

				{/* Edit-only -- a brand-new record has no status yet (confirmed against legacy, Gate 9). */}
				{mode === "edit" && (
					<HazardousEventFormField
						label={t("list.columns.record_status")}
						htmlFor="workflowStatusDisplay"
					>
						<input
							id="workflowStatusDisplay"
							type="text"
							disabled
							value={t(
								`status.${workflowStatusDisplay(workflowStatus).labelKey}`,
							)}
							readOnly
						/>
					</HazardousEventFormField>
				)}

				<HazardousEventFormField
					label={t("detail.fields.national_specification")}
					htmlFor="nationalSpecification"
					errors={fieldErrors?.nationalSpecification}
				>
					<textarea
						id="nationalSpecification"
						name="nationalSpecification"
						defaultValue={initialValues.nationalSpecification}
					/>
				</HazardousEventFormField>

				<div className="mg-grid mg-grid__col-3">
					<HazardousEventFlexibleDateField
						name="startDate"
						label={t("detail.fields.start_date")}
						initialValue={initialValues.startDate}
						errors={fieldErrors?.startDate}
					/>
					<HazardousEventFlexibleDateField
						name="endDate"
						label={t("detail.fields.end_date")}
						initialValue={initialValues.endDate}
						errors={fieldErrors?.endDate}
					/>
				</div>

				<HazardousEventFormField
					label={t("detail.fields.description")}
					htmlFor="description"
					errors={fieldErrors?.description}
				>
					<textarea
						id="description"
						name="description"
						defaultValue={initialValues.description}
					/>
				</HazardousEventFormField>

				<HazardousEventFormField
					label={t("detail.fields.chains_explanation")}
					htmlFor="chainsExplanation"
					errors={fieldErrors?.chainsExplanation}
				>
					<textarea
						id="chainsExplanation"
						name="chainsExplanation"
						defaultValue={initialValues.chainsExplanation}
					/>
				</HazardousEventFormField>

				<HazardousEventFormField
					label={t("detail.fields.magnitude")}
					htmlFor="magnitude"
					errors={fieldErrors?.magnitude}
				>
					<input
						id="magnitude"
						name="magnitude"
						type="text"
						defaultValue={initialValues.magnitude}
					/>
				</HazardousEventFormField>

				<HazardousEventFormField
					label={t("detail.fields.spatial_footprint")}
					htmlFor="spatialObservation"
					errors={fieldErrors?.spatialObservation}
				>
					{/* Placeholder -- no CA map/division-tree picker exists yet (found at implementation
					 * time); a real GIS widget is separate follow-up work, tracked as DEF-057. */}
					<p>{t("form.fields.spatial_footprint_placeholder")}</p>
					<input type="hidden" name="spatialObservation" value="" />
					{/* No interactive widget yet to ever flip this to "1" -- see the comment above. */}
					<input type="hidden" name="spatialObservationChanged" value="0" />
				</HazardousEventFormField>

				<HazardousEventFormField
					label=""
					htmlFor="attachments"
					errors={fieldErrors?.attachments}
				>
					{/* Reuses legacy's AttachmentsFormView as-is -- no CA-native upload path exists yet,
					 * attachments are silently dropped on save (DEF-054). Manages its own hidden field. */}
					<AttachmentsFormView
						ctx={ctx}
						initialData={initialValues.attachments}
						save_path_temp="/hazardous-event/file-temp-viewer"
						file_viewer_temp_url="/hazardous-event/file-temp-viewer"
						file_viewer_url="/hazardous-event/file-viewer"
						api_upload_url="/hazardous-event/file-pre-upload"
					/>
				</HazardousEventFormField>

				<HazardousEventFormField
					label={t("detail.fields.record_originator")}
					required
					htmlFor="recordOriginator"
					errors={fieldErrors?.recordOriginator}
				>
					<input
						id="recordOriginator"
						name="recordOriginator"
						type="text"
						required
						defaultValue={initialValues.recordOriginator}
					/>
				</HazardousEventFormField>

				{/* Lone <select>s stretch full-width (unlike inputs/textareas) -- wrapped in col-3 to
				 * match legacy (Decision 9 Addendum 3, measured: 415.987px legacy vs 1279.88px unwrapped). */}
				<div className="mg-grid mg-grid__col-3">
					<HazardousEventFormField
						label={t("detail.fields.hazardous_event_status")}
						htmlFor="hazardousEventStatus"
						errors={fieldErrors?.hazardousEventStatus}
					>
						<select
							id="hazardousEventStatus"
							name="hazardousEventStatus"
							defaultValue={initialValues.hazardousEventStatus ?? ""}
						>
							<option value="" />
							{HAZARDOUS_EVENT_STATUS_VALUES.map((status) => (
								<option key={status} value={status}>
									{t(`detail.hazardous_event_status_values.${status}`)}
								</option>
							))}
						</select>
					</HazardousEventFormField>
				</div>

				<HazardousEventFormField
					label={t("detail.fields.data_source")}
					htmlFor="dataSource"
					errors={fieldErrors?.dataSource}
				>
					<input
						id="dataSource"
						name="dataSource"
						type="text"
						defaultValue={initialValues.dataSource}
					/>
				</HazardousEventFormField>

				<input type="hidden" name="tempAction" value={tempAction} />
				<input
					type="hidden"
					name="tempValidatorUserIds"
					value={tempValidatorUserIds}
				/>

				{/* Discard-then-Save order and right alignment match legacy's own footer (Gate 9). */}
				<div className="flex justify-end gap-3">
					<button
						type="button"
						className="mg-button mg-button-outline"
						onClick={() => setDiscardOpen(true)}
					>
						{t("form.actions.discard")}
					</button>
					<button
						type="button"
						className="mg-button mg-button-primary"
						disabled={!isFormValid}
						onClick={() => setSaveSubmitOpen(true)}
					>
						{t("form.actions.save_or_submit")}
					</button>
				</div>
			</Form>

			<HazardousEventSaveSubmitModal
				visible={saveSubmitOpen}
				onHide={() => setSaveSubmitOpen(false)}
				onSubmit={submitWithAction}
				validatorCandidates={validatorCandidates}
				role={role}
			/>
			<HazardousEventDiscardModal
				visible={discardOpen}
				onHide={() => setDiscardOpen(false)}
				onSaveAsDraft={() => {
					setDiscardOpen(false);
					submitWithAction("submit-draft", []);
				}}
				onDiscard={() => navigate(-1)}
			/>
		</>
	);
}
