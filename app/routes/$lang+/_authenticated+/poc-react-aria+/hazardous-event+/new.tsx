// POC create route (openspec/changes/poc-react-aria-hazardous-event, Section 3).
//
// Auth wiring replicates production `new.tsx`
// (app/routes/$lang+/_authenticated+/hazardous-event+/new.tsx) verbatim: a manual
// requireUser -> getCountryAccountsIdFromSession -> hasPermission("EditData") sequence, not
// `authLoaderWithPerm` (design.md Decision 2). React Router v7 runs matched route loaders in
// parallel, so the `_authenticated+` parent layout's own `requireUser` call does not run
// before this loader — each loader must independently guarantee the redirect/403.
// `argsWithSession` is constructed the same way production does, because
// `authLoaderGetUserForFrontend` reads `args.userSession` (injected here since the old
// `authLoaderWithPerm` wrapper isn't in play).
//
// Reference/dropdown data (hazard picker options, validator list, division geojson) comes
// from static fixtures (design.md Decision 8) instead of `dataForHazardPicker`,
// `getUserCountryAccountsWithValidatorRole`/`getUserCountryAccountsWithAdminRole`, and the
// `divisionTable` query — no live DB read for any of it. Production's `?parent=` caused-by
// lookup branch normally does a real `hazardousEventById` DB read to render the parent's
// label; task 3.4 reads the `?parent=` query param but does not look it up against any DB or
// fixture (design.md Decision 8 forbids a live read, and no fixture is keyed by arbitrary
// parent ids) — see hazardClassificationField.tsx's `CausedByField` for the read-only
// treatment used instead.
//
// The action stays wrapped in the real `authActionWithPerm("EditData", ...)` permission
// check (unchanged). Its body implements the mocked submit (task 3.9a, design.md Decision 6
// revised): assemble the accumulated stepper state into `hazardousEventCreate`'s input shape,
// log it, and return a simulated success result — never calling the real save/approval-workflow
// functions.
//
// The stepper (task 3.3) holds every field's value in one controlled state object and mounts
// only the active step's inputs — unmounting the others rather than CSS-hiding them (design.md
// Decision 4). A naive "one big always-mounted form with CSS `display:none` on inactive steps"
// approach would let a `required` field on a hidden step block native `reportValidity()` with
// no way for the user to see why, since several required fields (`startDate`, `endDate`,
// `recordOriginator`, `hipHazardId`) are spread across different steps. Per-step Next validation
// (task 3.10, this round) is implemented below via `getBlockingErrors`/`showStepErrors`.
//
// Tasks 3.4-3.5 built Step 1 (classification & linkage) and Step 2 (timing &
// characterization) with real fields, reading every label/required flag from `fieldsDef(ctx)`
// (task 3.2) except `hipHazardId`/`hipClusterId`/`hipTypeId`/`parent`, whose `fieldsDef` labels
// are empty/placeholder in production too (they're always overridden at render time there) —
// see hazardClassificationField.tsx's file header for where those four keys' real labels come
// from instead. Step1Content/Step2Content and the hazard classification picker are defined at
// module scope (not nested inside the route component) so their identity is stable across
// renders — an inline nested function component would remount on every keystroke.
//
// Tasks 3.6-3.7 build Step 3 (location) and Step 4 (evidence, provenance & review) by reusing
// `SpatialFootprintFormView`/`AttachmentsFormView` completely unchanged (design.md Decision 3),
// wired exactly the way production's `HazardousEventForm`
// (app/frontend/events/hazardeventform.tsx) invokes them — same prop names, same real upload/
// viewer URLs. Both components render their own internal caption ("Spatial footprint" /
// "Attachments"), matching production's own `<Field label="">` override for these two keys —
// so, like production, no extra outer label is rendered here either. `spatialFootprint` isn't
// actually a member of `HazardousEventFields` (it's loaded via a separate join, not a column on
// `hazardous_event` — see `loadHazardousEventSpatialFootprint` in
// `~/backend.server/models/event`); `StepperFields` below widens the stepper's own state type by
// exactly that one key instead of reaching for an `any` cast. See Step4Content's file-local
// comment for a real interface mismatch this surfaced: `AttachmentsFormView` has no `onChange`
// of its own to wire into this controlled-state model.
//
// Task 3.10 (this round) wires per-step "Next" validation gating: `getBlockingErrors` checks
// only the specific fields design.md Decision 4 calls out as spread across steps
// (`hipHazardId` on step 1 — effectively required per the UI's "Hazard classification *" label
// even though it carries no `fieldsDefCommon` `required` flag; `startDate`/`endDate` on step 2;
// `recordOriginator` on step 4, which has no "Next" of its own so the check instead gates the
// "Save or submit" button that opens `SaveSubmitDialogRac`) — an explicit check against the
// state slice for each step (design.md Decision 4's second option), not RAC's `isRequired`/
// `validate` props, since those only drive ARIA/native-`<form>` semantics and this stepper
// deliberately never submits via a native form (see the Decision 4 note above on why). Step 3
// (location) has no `required: true` field in `fieldsDefCommon` — confirmed by re-reading it —
// so `getBlockingErrors` returns `[]` there and Next is never blocked on that step. Blocking
// reasons are shown in a single grouped alert box near the bottom button bar (mirroring
// `form_components.tsx`'s real `Form` component's own grouped `errors.form` list rendering — a
// list of messages in one place, not a per-field-scattered pattern) rather than disabling Next
// with no explanation. The box only appears once the user actually attempts to advance past a
// blocked step (`showStepErrors`, reset whenever the step successfully changes) so a fresh step
// doesn't greet the user with red text before they've touched anything; because
// `currentStepErrors` is recomputed on every render rather than snapshotted at click time, fixing
// the offending field makes the box disappear immediately, without needing to click Next again.
//
// Tasks 3.8/3.9/3.9a (this round) wire up the two rebuilt dialogs and the mocked submit:
// - `DiscardDialogRac` (./discardDialog.tsx, task 3.8) — opened via the "Cancel" button in the
//   bottom button bar, present on every step.
// - `SaveSubmitDialogRac` (./saveSubmitDialog.tsx, task 3.9) — opened via the "Save or submit"
//   button that replaces "Next" on the final step; reproduces the real `SaveSubmitDialog`'s
//   save-as-draft/validate/submit-for-validation rules, including the validator-required-for-
//   submit-for-validation gate.
// - The `action` below (task 3.9a, design.md Decision 6 revised) assembles the accumulated
//   stepper state into `hazardousEventCreate`'s expected input shape, logs it, and returns a
//   simulated success result — never calling the real save/approval-workflow functions. The
//   client submits to it via `useFetcher` (not native `<form>` submission, per Decision 4 — not
//   every field is ever simultaneously mounted), and renders a success/confirmation panel in
//   place of the stepper once `fetcher.data.ok` is true, showing the assembled payload directly
//   on the page (not just `console.log`, since nobody would see a server-terminal log while
//   clicking through the page).
// - Forward hazard from task 3.7: attachments only sync into `fields.attachments` on step-away
//   (Step4Content's `useLayoutEffect` cleanup). Opening `SaveSubmitDialogRac` from step 4 does
//   NOT unmount Step4Content, so that cleanup never fires — `handleOpenSaveSubmit` below reads
//   the same hidden textarea directly, right before opening the dialog, so the assembled payload
//   reflects the latest attachment edits regardless of navigation history.
import { redirect, useFetcher, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Button } from "react-aria-components";
import { useLayoutEffect, useState } from "react";

import type { HazardousEventFields } from "~/backend.server/models/event";
import type { HipDataForHazardPicker } from "~/backend.server/models/hip_hazard_picker";
import { fieldsDef } from "~/frontend/events/hazardeventform";
import { MainContainer } from "~/frontend/container";
import { ViewContext } from "~/frontend/context";
import { SpatialFootprintFormView } from "~/frontend/spatialFootprintFormView";
import { AttachmentsFormView } from "~/frontend/attachmentsFormView";
import { htmlTitle } from "~/utils/htmlmeta";
import { TEMP_UPLOAD_PATH } from "~/utils/paths";
import {
	authActionGetAuth,
	authActionWithPerm,
	authLoaderGetUserForFrontend,
	hasPermission,
	requireUser,
} from "~/utils/auth";
import type { UserSession } from "~/utils/session";
import {
	getCountryAccountsIdFromSession,
	getCountrySettingsFromSession,
} from "~/utils/session";

import { hazardPickerDataFixture } from "./fixtures/hazardPickerData";
import { validatorUsersFixture } from "./fixtures/validatorUsers";
import { divisionGeoJsonFixture } from "./fixtures/divisionGeoJson";
import type { DivisionGeoJsonRow } from "./fixtures/divisionGeoJson";
import {
	DateInputField,
	EnumRadioField,
	TextAreaInputField,
	TextInputField,
	fieldMetaOrThrow,
} from "./formFields";
import {
	CausedByField,
	HazardClassificationField,
} from "./hazardClassificationField";
import { DiscardDialogRac } from "./discardDialog";
import { SaveSubmitDialogRac } from "./saveSubmitDialog";
import type { SaveSubmitAction } from "./saveSubmitDialog";

export const meta: MetaFunction = ({ params }) => {
	const ctx = new ViewContext({ lang: params.lang || "en" });

	return [
		{
			title: htmlTitle(
				ctx,
				ctx.t({
					code: "poc.hazardous_events.create",
					msg: "Add hazardous event (React Aria POC)",
				}),
			),
		},
	];
};

export async function loader(loaderArgs: LoaderFunctionArgs) {
	const { request, params } = loaderArgs;
	const lang = params.lang ?? "en";

	// Task 3.1 — copied near-verbatim from production `new.tsx` (design.md Decision 2).
	const userSession = await requireUser({ request, params });
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) throw redirect(`/${lang}/user/select-instance`);
	const permitted = await hasPermission(request, "EditData");
	if (!permitted) throw new Response("Forbidden", { status: 403 });

	const argsWithSession = { ...loaderArgs, userSession };
	const user = await authLoaderGetUserForFrontend(argsWithSession);

	// Task 3.6: `ctryIso3` is read from session (not a DB content read) the same real way
	// production's `new.tsx` does — design.md Decision 8 only mandates mocking the
	// reference/dropdown DB query results (hazard picker options, validator list, division
	// geojson), not session-derived config values like this one.
	const settings = await getCountrySettingsFromSession(request);
	const ctryIso3 = settings?.dtsInstanceCtryIso3 || "";

	// Task 3.4: read `?parent=` the same way production's create route does, but — per
	// design.md Decision 8 — without following it up with a live `hazardousEventById` DB read.
	// The value is only used for the read-only "Caused by" display (CausedByField).
	const parentId = new URL(request.url).searchParams.get("parent") || undefined;

	// Decision 8: reference/dropdown data is static fixture data, not a live DB read.
	return {
		hip: hazardPickerDataFixture,
		usersWithValidatorRole: validatorUsersFixture,
		divisionGeoJSON: divisionGeoJsonFixture,
		ctryIso3,
		user,
		countryAccountsId,
		parentId,
	};
}

/** Shape returned by the mocked submit action (task 3.9a) — always `ok: true` since there is no
 *  real validation/persistence path to fail against (design.md Decision 6, revised). `payload`
 *  mirrors what production's `new.tsx` action assembles as `eventData` right before calling
 *  `hazardousEventCreate` (`{ ...data, countryAccountsId, createdByUserId, updatedByUserId }`),
 *  plus the two hidden `tempAction`/`tempValidatorUserIds` fields `SaveSubmitDialog` sets in
 *  production — never actually passed to `hazardousEventCreate`/`handleApprovalWorkflowService`
 *  here. */
export interface MockedSubmitResult {
	ok: true;
	simulated: true;
	action: string;
	simulatedId: string;
	payload: Record<string, unknown>;
}

export const action = authActionWithPerm("EditData", async (actionArgs) => {
	// Task 3.9a (design.md Decision 6, revised). Real permission check above (authActionWithPerm)
	// already passed by the time this body runs. The stepper submits its full accumulated state
	// as one JSON string (not native FormData — see the file header on why: not every field is
	// ever simultaneously mounted), so this action's only job is to parse that back out, assemble
	// it into the same shape `hazardousEventCreate` would receive, and hand it back for display —
	// never calling the real save/approval-workflow functions.
	const { request } = actionArgs;
	const userSession = authActionGetAuth(actionArgs) as UserSession;
	const countryAccountsId = await getCountryAccountsIdFromSession(request);

	const formData = await request.formData();
	const submitAction = String(formData.get("action") ?? "submit-draft");
	const validatorIdsRaw = String(formData.get("validatorIds") ?? "");
	const payloadRaw = String(formData.get("payload") ?? "{}");

	let stepperFields: Record<string, unknown> = {};
	try {
		stepperFields = JSON.parse(payloadRaw);
	} catch {
		// Malformed client payload — fall back to an empty object rather than throwing. This is a
		// mocked action with no real persistence at stake, so failing loudly here would only
		// break the POC's own demo, not protect any real data.
		stepperFields = {};
	}

	const assembledPayload: Record<string, unknown> = {
		...stepperFields,
		countryAccountsId,
		createdByUserId: userSession.user.id,
		updatedByUserId: userSession.user.id,
		tempAction: submitAction,
		tempValidatorUserIds: validatorIdsRaw,
	};

	// Held/displayed on the confirmation screen (see the success render below) rather than only
	// console.log'd — a server-terminal log is not visible to anyone clicking through the page.
	console.log(
		"[poc-react-aria/hazardous-event] simulated submit payload:",
		assembledPayload,
	);

	const result: MockedSubmitResult = {
		ok: true,
		simulated: true,
		action: submitAction,
		simulatedId: `simulated-${Date.now()}`,
		payload: assembledPayload,
	};
	return result;
});

/** `spatialFootprint` is intentionally absent from `HazardousEventFields` — it's loaded via a
 *  separate join (`loadHazardousEventSpatialFootprint`), not a column on the `hazardous_event`
 *  table, so it isn't a real `keyof HazardousEventFields`. `fieldsDefCommon` still declares a
 *  `{ key: "spatialFootprint", ... }` entry for it (production works around the same gap with
 *  `(fields as any)?.spatialFootprint` casts throughout `~/backend.server/models/event`); this
 *  widens the stepper's own controlled-state type by exactly that one key, typed as `unknown`
 *  rather than `any`, instead of reproducing that cast here. `SpatialFootprintFormView`'s own
 *  props are untyped (`any`) regardless, so this doesn't lose any real type information. */
type StepperFields = Partial<HazardousEventFields> & {
	spatialFootprint?: unknown;
};

interface StepDef {
	id: number;
	titleCode: string;
	titleMsg: string;
}

// The 4-step breakdown from design.md Decision 4. Real field content per step: tasks 3.4 (step
// 1), 3.5 (step 2), 3.6 (step 3), 3.7 (step 4).
const STEPS: StepDef[] = [
	{
		id: 1,
		titleCode: "poc.hazardous_event.step1_title",
		titleMsg: "Classification & linkage",
	},
	{
		id: 2,
		titleCode: "poc.hazardous_event.step2_title",
		titleMsg: "Timing & characterization",
	},
	{
		id: 3,
		titleCode: "poc.hazardous_event.step3_title",
		titleMsg: "Location",
	},
	{
		id: 4,
		titleCode: "poc.hazardous_event.step4_title",
		titleMsg: "Evidence, provenance & review",
	},
];

function requiredFieldMessage(ctx: ViewContext, label: string): string {
	return ctx.t(
		{
			code: "poc.hazardous_event.field_required",
			desc: "Shown in the per-step 'Next'/'Save or submit' blocking-reasons box (task 3.10) for a required field the user hasn't filled in yet. {label} is that field's own real display label/name.",
			msg: "{label} is required.",
		},
		{ label },
	);
}

/** Task 3.10 — an explicit check against the state slice for each step (design.md Decision 4's
 *  second option), not RAC's `isRequired`/`validate` props: those only drive ARIA/native-`<form>`
 *  semantics, and this stepper deliberately never submits via a native form (see the file header
 *  on why). Only checks the specific fields design.md names as spread across steps:
 *  `hipHazardId` (step 1, effectively required per the UI even without a `fieldsDefCommon`
 *  `required` flag), `startDate`/`endDate` (step 2), `recordOriginator` (step 4). Step 3
 *  (location) has no `required: true` entry in `fieldsDefCommon` — confirmed by reading it again
 *  for this task — so it falls through to the empty default and is never blocked. */
function getBlockingErrors(
	stepIndex: number,
	ctx: ViewContext,
	fieldsMeta: ReturnType<typeof fieldsDef>,
	fields: StepperFields,
): string[] {
	if (stepIndex === 0) {
		return fields.hipHazardId
			? []
			: [
					requiredFieldMessage(
						ctx,
						ctx.t({
							code: "hip.hazard_classification",
							msg: "Hazard classification",
						}),
					),
				];
	}

	if (stepIndex === 1) {
		const errors: string[] = [];
		if (!fields.startDate) {
			errors.push(
				requiredFieldMessage(
					ctx,
					fieldMetaOrThrow(fieldsMeta, "startDate").label,
				),
			);
		}
		if (!fields.endDate) {
			errors.push(
				requiredFieldMessage(
					ctx,
					fieldMetaOrThrow(fieldsMeta, "endDate").label,
				),
			);
		}
		return errors;
	}

	if (stepIndex === 3) {
		return fields.recordOriginator
			? []
			: [
					requiredFieldMessage(
						ctx,
						fieldMetaOrThrow(fieldsMeta, "recordOriginator").label,
					),
				];
	}

	// stepIndex === 2 (location): no required field in fieldsDefCommon — nothing to gate.
	return [];
}

/** Module-scope (not nested inside the route component) so identity stays stable across
 *  renders — see the file header note on why that matters for input focus. */
function Step1Content({
	ctx,
	fieldsMeta,
	fields,
	setField,
	patchFields,
	hip,
}: {
	ctx: ViewContext;
	fieldsMeta: ReturnType<typeof fieldsDef>;
	fields: StepperFields;
	setField: <K extends keyof StepperFields>(
		key: K,
		value: StepperFields[K] | undefined,
	) => void;
	patchFields: (patch: Partial<HazardousEventFields>) => void;
	hip: HipDataForHazardPicker;
}) {
	const nationalSpecificationDef = fieldMetaOrThrow(
		fieldsMeta,
		"nationalSpecification",
	);
	const hazardousEventStatusDef = fieldMetaOrThrow(
		fieldsMeta,
		"hazardousEventStatus",
	);

	return (
		<div className="flex flex-col gap-6">
			<HazardClassificationField
				ctx={ctx}
				hip={hip}
				required
				typeId={fields.hipTypeId ?? undefined}
				clusterId={fields.hipClusterId ?? undefined}
				hazardId={fields.hipHazardId ?? undefined}
				onChange={patchFields}
			/>

			<CausedByField
				ctx={ctx}
				parentId={fields.parent}
				onClear={() => setField("parent", undefined)}
			/>

			<EnumRadioField
				def={hazardousEventStatusDef}
				value={fields.hazardousEventStatus ?? ""}
				onChange={(v) =>
					setField(
						"hazardousEventStatus",
						v as HazardousEventFields["hazardousEventStatus"],
					)
				}
			/>

			<TextAreaInputField
				def={nationalSpecificationDef}
				value={fields.nationalSpecification ?? ""}
				onChange={(v) => setField("nationalSpecification", v)}
			/>
		</div>
	);
}

function Step2Content({
	fieldsMeta,
	fields,
	setField,
}: {
	fieldsMeta: ReturnType<typeof fieldsDef>;
	fields: StepperFields;
	setField: <K extends keyof StepperFields>(
		key: K,
		value: StepperFields[K] | undefined,
	) => void;
}) {
	const startDateDef = fieldMetaOrThrow(fieldsMeta, "startDate");
	const endDateDef = fieldMetaOrThrow(fieldsMeta, "endDate");
	const magnitudeDef = fieldMetaOrThrow(fieldsMeta, "magnitude");
	const descriptionDef = fieldMetaOrThrow(fieldsMeta, "description");
	const chainsExplanationDef = fieldMetaOrThrow(
		fieldsMeta,
		"chainsExplanation",
	);

	return (
		<div className="flex flex-col gap-6">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<DateInputField
					def={startDateDef}
					value={fields.startDate ?? undefined}
					onChange={(v) => setField("startDate", v)}
				/>
				<DateInputField
					def={endDateDef}
					value={fields.endDate ?? undefined}
					onChange={(v) => setField("endDate", v)}
				/>
			</div>

			<TextInputField
				def={magnitudeDef}
				value={fields.magnitude ?? ""}
				onChange={(v) => setField("magnitude", v)}
			/>

			<TextAreaInputField
				def={descriptionDef}
				value={fields.description ?? ""}
				onChange={(v) => setField("description", v)}
			/>

			<TextAreaInputField
				def={chainsExplanationDef}
				value={fields.chainsExplanation ?? ""}
				onChange={(v) => setField("chainsExplanation", v)}
			/>
		</div>
	);
}

/** Task 3.6 — reuses `SpatialFootprintFormView` completely unchanged (design.md Decision 3),
 *  wired the same way production's `HazardousEventForm` does (see hazardeventform.tsx's
 *  `spatialFootprint` override: `divisions`/`ctryIso3`/`treeData`/`initialData`). `treeData` is
 *  always `[]` in production too — the component lazily fetches the real division tree itself
 *  (`ensureTreeDataLoaded`, an internal `fetch("/api/division/tree")` call) only when its
 *  "Select geographic level" dialog opens; that live call is part of the component's own
 *  "reuse as-is" internals, not something this task's fixture wiring controls or needs to mock.
 *
 *  No friction here: unlike `AttachmentsFormView` (see Step4Content below), this component
 *  already exposes a real `onChange(items)` callback that its own `ContentRepeater` fires on
 *  every add/edit/delete/reorder — a genuinely controlled-enough shape for this stepper's
 *  single-state-object model. `initialData` only seeds `ContentRepeater`'s internal item state
 *  at mount (edits after that live in the component's own state, not a prop it re-reads), which
 *  fits the "only the active step's inputs are mounted" model exactly: remounting this step
 *  re-seeds from whatever this stepper's own state currently holds. */
function Step3Content({
	ctx,
	fields,
	setField,
	divisionGeoJSON,
	ctryIso3,
}: {
	ctx: ViewContext;
	fields: StepperFields;
	setField: <K extends keyof StepperFields>(
		key: K,
		value: StepperFields[K] | undefined,
	) => void;
	divisionGeoJSON: DivisionGeoJsonRow[];
	ctryIso3: string;
}) {
	return (
		<div className="flex flex-col gap-6">
			<SpatialFootprintFormView
				ctx={ctx}
				divisions={divisionGeoJSON}
				ctryIso3={ctryIso3}
				treeData={[]}
				initialData={fields.spatialFootprint ?? []}
				onChange={(items) => setField("spatialFootprint", items)}
			/>
		</div>
	);
}

/** Task 3.7 — reuses `AttachmentsFormView` completely unchanged (design.md Decision 3), wired
 *  the same way production's `HazardousEventForm` does (see hazardeventform.tsx's `attachments`
 *  override: `save_path_temp`/`file_viewer_temp_url`/`file_viewer_url`/`api_upload_url` point at
 *  the same real production upload/viewer routes — reusing the real upload mechanics is
 *  intended here, not a scope violation, since `ContentRepeater`'s upload plumbing is
 *  backend-adjacent, not a component-library concern).
 *
 *  **Friction found, flagged per this task's instructions:** unlike `SpatialFootprintFormView`,
 *  `AttachmentsFormView` accepts no `onChange` prop at all — its own `onChange` handed to
 *  `ContentRepeater` is dead code (`(items) => { try { Array.isArray(items) ? items : items; }
 *  catch {} }`, verified by reading `~/frontend/attachmentsFormView.tsx`) that never calls back
 *  out. Production doesn't need one: `ContentRepeater` (`~/components/ContentRepeater/index.tsx`)
 *  renders a hidden `<textarea id="attachments" name="attachments" value={JSON.stringify(...)}
 *  readOnly>` that production's real `<form id="form-new">` reads via native `FormData` at
 *  `requestSubmit()` time — its actual real interface for getting data out is that hidden DOM
 *  node, not a React callback. This stepper serializes its accumulated state directly instead of
 *  submitting via a native form (design.md Decision 4: not every field is ever simultaneously
 *  mounted), so there is no submit-time native `FormData` read to lean on either. Adaptation:
 *  this effect's cleanup — which fires on navigating away from this step, while the hidden
 *  textarea is still attached to the DOM — reads that same node and folds its JSON value back
 *  into the controlled state object. This is the closest equivalent to that component's real
 *  interface available without editing `AttachmentsFormView`/`ContentRepeater` (out of scope,
 *  shared with disaster-event/disaster-record per design.md Decision 3). */
function Step4Content({
	ctx,
	fieldsMeta,
	fields,
	setField,
}: {
	ctx: ViewContext;
	fieldsMeta: ReturnType<typeof fieldsDef>;
	fields: StepperFields;
	setField: <K extends keyof StepperFields>(
		key: K,
		value: StepperFields[K] | undefined,
	) => void;
}) {
	const recordOriginatorDef = fieldMetaOrThrow(fieldsMeta, "recordOriginator");
	const dataSourceDef = fieldMetaOrThrow(fieldsMeta, "dataSource");

	// useLayoutEffect (not useEffect): an unmounting component's passive-effect cleanup runs
	// after its DOM is already detached, too late to read it — verified empirically (an
	// earlier useEffect version silently dropped every attachment on step-away).
	useLayoutEffect(() => {
		return () => {
			// Query by `name`, not `getElementById`: ContentRepeater (reused unchanged) gives
			// both its root `<div>` and the hidden `<textarea>` the same `id="attachments"` —
			// getElementById returns the div (no `.value`), silently dropping data. Confirmed by
			// logging `tagName`/`.value` during a live repro before landing on this fix.
			const attachmentsTextarea = document.querySelector(
				'textarea[name="attachments"]',
			) as HTMLTextAreaElement | null;
			if (!attachmentsTextarea) return;
			try {
				setField("attachments", JSON.parse(attachmentsTextarea.value || "[]"));
			} catch {
				// Leave state untouched if the hidden textarea isn't valid JSON yet.
			}
		};
		// Runs only on this step's unmount (navigating away) — deliberately not re-run per
		// keystroke/edit, since AttachmentsFormView exposes no per-edit signal to depend on.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div className="flex flex-col gap-6">
			<AttachmentsFormView
				ctx={ctx}
				initialData={fields.attachments ?? []}
				save_path_temp={TEMP_UPLOAD_PATH}
				file_viewer_temp_url={`/${ctx.lang}/hazardous-event/file-temp-viewer`}
				file_viewer_url="/hazardous-event/file-viewer"
				api_upload_url="/hazardous-event/file-pre-upload"
			/>

			<TextInputField
				def={recordOriginatorDef}
				value={fields.recordOriginator ?? ""}
				onChange={(v) => setField("recordOriginator", v)}
			/>

			<TextInputField
				def={dataSourceDef}
				value={fields.dataSource ?? ""}
				onChange={(v) => setField("dataSource", v)}
			/>
		</div>
	);
}

/** Task 3.9a — the confirmation panel shown in place of the stepper once the mocked action
 *  returns. Displays the assembled payload directly on the page (design.md Decision 6, revised)
 *  rather than only logging it server-side, and clearly labels the save as simulated since no
 *  real hazardous event record exists behind `simulatedId`. */
function SubmitSuccessContent({
	ctx,
	result,
}: {
	ctx: ViewContext;
	result: MockedSubmitResult;
}) {
	const actionHeadings: Record<string, string> = {
		"submit-draft": ctx.t({
			code: "poc.hazardous_event.saved_draft",
			msg: "Event saved as draft",
		}),
		"submit-validate": ctx.t({
			code: "poc.hazardous_event.validated",
			msg: "Event validated",
		}),
		"submit-publish": ctx.t({
			code: "poc.hazardous_event.validated_published",
			msg: "Event validated and published",
		}),
		"submit-validation": ctx.t({
			code: "poc.hazardous_event.submitted_for_validation",
			msg: "Submitted for validation",
		}),
	};

	return (
		<div className="mx-auto max-w-3xl py-8">
			<div className="flex flex-col gap-4">
				<h2 className="text-lg font-medium text-[#181823]">
					{actionHeadings[result.action] ?? actionHeadings["submit-draft"]}
				</h2>
				<p className="rounded-[0.57rem] border border-[#106cb8] bg-[#eef6fc] p-4 text-sm text-[#333333]">
					{ctx.t({
						code: "poc.hazardous_event.simulated_save_note",
						desc: "Explains that this create-page submit is fully mocked (design.md Decision 6, revised) — no real database write happens.",
						msg: "This was a simulated save — no hazardous event record was actually created (React Aria POC).",
					})}{" "}
					{ctx.t(
						{
							code: "poc.hazardous_event.simulated_id",
							desc: "{id} is a made-up id shown in place of production's real created-record id, since no real record exists.",
							msg: "Simulated record id: {id}",
						},
						{ id: result.simulatedId },
					)}
				</p>
				<div>
					<h3 className="mb-2 text-sm font-medium text-[#333333]">
						{ctx.t({
							code: "poc.hazardous_event.assembled_payload",
							msg: "Assembled payload (shape matches hazardousEventCreate's input contract)",
						})}
					</h3>
					<pre className="max-h-[24rem] overflow-auto rounded-[0.57rem] border border-gray-300 bg-gray-50 p-4 text-xs">
						{JSON.stringify(result.payload, null, 2)}
					</pre>
				</div>
				<div>
					<Button
						onPress={() =>
							(document.location.href = ctx.url(
								"/poc-react-aria/hazardous-event",
							))
						}
						className="rounded-[0.57rem] bg-[#004f91] px-[1.14rem] py-[0.8rem] font-medium text-white data-[hovered]:bg-[#106cb8] data-[focus-visible]:shadow-[0_0_0_2px_#106cb8] data-[focus-visible]:outline-none"
					>
						{ctx.t({
							code: "poc.hazardous_event.back_to_list",
							msg: "Back to hazardous events list (POC)",
						})}
					</Button>
				</div>
			</div>
		</div>
	);
}

export default function PocHazardousEventCreate() {
	// Hazard picker/division-geojson/validator-list fixtures and the `?parent=` id are consumed
	// by Steps 1, 3, and the SaveSubmitDialog rebuild below.
	const ld = useLoaderData<typeof loader>();
	const ctx = new ViewContext();
	const fetcher = useFetcher<typeof action>();

	// Task 3.2: field metadata (labels, `required`, enum options) is read from the real
	// fieldsDef contract, not redefined — fieldsDefCommon/fieldsDef stay the single source of
	// truth (design.md Decision 5: the generic FormView/Inputs rendering engine is not reused,
	// but its underlying field metadata is).
	const fieldsMeta = fieldsDef(ctx);

	// Task 3.3: a single controlled state object holds every field's value across the whole
	// stepper. Only the active step's inputs are ever mounted (see the render below) — nothing
	// is CSS-hidden — so values persist across navigation regardless of mount state. `parent` is
	// seeded once from the loader's `?parent=` read (task 3.4) — from then on it's plain stepper
	// state like every other field, clearable via CausedByField's "Unset" button. Typed as
	// `StepperFields` (task 3.6), not `Partial<HazardousEventFields>`, to also hold
	// `spatialFootprint` — see that type's own comment above for why.
	const [fields, setFields] = useState<StepperFields>(() => ({
		parent: ld.parentId,
	}));
	const [stepIndex, setStepIndex] = useState(0);

	// Tasks 3.8/3.9 — the two rebuilt dialogs are controlled from this top-level state rather
	// than `DialogTrigger`'s own uncontrolled open state, since their triggers ("Cancel" and
	// "Save or submit") live in the shared bottom button bar, not immediately adjacent to the
	// dialog markup itself.
	const [isDiscardOpen, setIsDiscardOpen] = useState(false);
	const [isSaveSubmitOpen, setIsSaveSubmitOpen] = useState(false);

	// Task 3.10 — recomputed every render (not snapshotted at click time) so the blocking-reasons
	// box below auto-clears the moment the offending field is filled in, without requiring another
	// Next click. `showStepErrors` gates whether it's actually displayed: false on a fresh step (so
	// an untouched step doesn't greet the user with red text), flips true only once the user
	// attempts to advance while blocked.
	const currentStepErrors = getBlockingErrors(
		stepIndex,
		ctx,
		fieldsMeta,
		fields,
	);
	const [showStepErrors, setShowStepErrors] = useState(false);

	const setField = <K extends keyof StepperFields>(
		key: K,
		value: StepperFields[K] | undefined,
	) => {
		setFields((prev) => ({ ...prev, [key]: value }));
	};
	const patchFields = (patch: Partial<HazardousEventFields>) => {
		setFields((prev) => ({ ...prev, ...patch }));
	};

	const currentStep = STEPS[stepIndex];
	const isFirstStep = stepIndex === 0;
	const isLastStep = stepIndex === STEPS.length - 1;

	const usersWithValidatorRole = ld.usersWithValidatorRole.map((u) => ({
		id: u.id,
		name: `${u.firstName} ${u.lastName}`,
		email: u.email,
	}));

	const handleDiscard = () => {
		document.location.href = ctx.url("/poc-react-aria/hazardous-event");
	};

	// Task 3.10 — "Next" no longer unconditionally advances: it re-checks the current step's own
	// required fields first. Blocked -> reveal the reasons box instead of moving; the box then
	// self-clears as soon as the field is filled (see `currentStepErrors`'s own comment above).
	const handleNext = () => {
		if (currentStepErrors.length > 0) {
			setShowStepErrors(true);
			return;
		}
		setShowStepErrors(false);
		setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
	};

	// Back is intentionally never gated — task 3.10 only asks for forward ("Next") validation;
	// production itself imposes no backward-navigation validation either.
	const handleBack = () => {
		setShowStepErrors(false);
		setStepIndex((i) => Math.max(0, i - 1));
	};

	const handleOpenSaveSubmit = () => {
		// Task 3.10 — step 4 has no "Next" of its own; gate the "Save or submit" trigger instead
		// (design.md Decision 4 / this task's instructions), so `recordOriginator` still can't be
		// skipped just because this step's action button has a different label.
		if (currentStepErrors.length > 0) {
			setShowStepErrors(true);
			return;
		}

		// Forward hazard from task 3.7: opening this dialog does not unmount Step4Content, so its
		// step-away `useLayoutEffect` cleanup never runs — read the same hidden textarea directly
		// here so `fields.attachments` reflects the latest edit before it's serialized below.
		const attachmentsTextarea = document.querySelector(
			'textarea[name="attachments"]',
		) as HTMLTextAreaElement | null;
		if (attachmentsTextarea) {
			try {
				setField("attachments", JSON.parse(attachmentsTextarea.value || "[]"));
			} catch {
				// Leave state untouched if the hidden textarea isn't valid JSON yet.
			}
		}
		setIsSaveSubmitOpen(true);
	};

	const handleConfirmSaveSubmit = (
		action: SaveSubmitAction,
		validatorIds: string[],
	) => {
		setIsSaveSubmitOpen(false);
		fetcher.submit(
			{
				action,
				validatorIds: validatorIds.join(","),
				payload: JSON.stringify(fields),
			},
			{ method: "post" },
		);
	};

	const submitResult = fetcher.data;
	if (submitResult?.ok) {
		return (
			<MainContainer
				title={ctx.t({
					code: "poc.hazardous_events.create",
					msg: "Add hazardous event (React Aria POC)",
				})}
			>
				<SubmitSuccessContent ctx={ctx} result={submitResult} />
			</MainContainer>
		);
	}

	return (
		<MainContainer
			title={ctx.t({
				code: "poc.hazardous_events.create",
				msg: "Add hazardous event (React Aria POC)",
			})}
		>
			<div className="mx-auto max-w-3xl py-8">
				<p className="mb-4 text-sm font-medium text-[#333333]">
					{ctx.t(
						{
							code: "poc.hazardous_event.step_indicator",
							desc: "Stepper progress indicator. {step} is the current step number, {total} is the total step count, {title} is the current step's title.",
							msg: "Step {step} of {total}: {title}",
						},
						{
							step: currentStep.id,
							total: STEPS.length,
							title: ctx.t({
								code: currentStep.titleCode,
								msg: currentStep.titleMsg,
							}),
						},
					)}
				</p>

				<div className="min-h-[12rem] rounded-[0.57rem] border border-gray-300 p-6">
					{stepIndex === 0 ? (
						<Step1Content
							ctx={ctx}
							fieldsMeta={fieldsMeta}
							fields={fields}
							setField={setField}
							patchFields={patchFields}
							hip={ld.hip}
						/>
					) : stepIndex === 1 ? (
						<Step2Content
							fieldsMeta={fieldsMeta}
							fields={fields}
							setField={setField}
						/>
					) : stepIndex === 2 ? (
						<Step3Content
							ctx={ctx}
							fields={fields}
							setField={setField}
							divisionGeoJSON={ld.divisionGeoJSON}
							ctryIso3={ld.ctryIso3}
						/>
					) : (
						<Step4Content
							ctx={ctx}
							fieldsMeta={fieldsMeta}
							fields={fields}
							setField={setField}
						/>
					)}
				</div>

				{showStepErrors && currentStepErrors.length > 0 ? (
					// Task 3.10 — grouped blocking-reasons box, mirroring `form_components.tsx`'s real
					// `Form` component's own grouped `errors.form` list rendering (one place, one list)
					// rather than scattering per-field error text through Step1Content/Step2Content/
					// Step4Content's own prop signatures.
					<div
						role="alert"
						className="mt-4 rounded-[0.57rem] border border-red-400 bg-red-50 p-3 text-sm text-red-700"
					>
						<p className="mb-1 font-medium">
							{ctx.t({
								code: "poc.hazardous_event.step_blocked",
								msg: "Complete the following before continuing:",
							})}
						</p>
						<ul className="list-disc pl-5">
							{currentStepErrors.map((message, index) => (
								<li key={index}>{message}</li>
							))}
						</ul>
					</div>
				) : null}

				<div className="mt-6 flex justify-between">
					<div className="flex gap-3">
						<Button
							onPress={() => setIsDiscardOpen(true)}
							className="rounded-[0.57rem] border border-gray-300 px-[1.14rem] py-[0.8rem] font-medium text-[#333333] data-[hovered]:bg-[#e6e6e6] data-[focus-visible]:shadow-[0_0_0_2px_#106cb8] data-[focus-visible]:outline-none"
						>
							{ctx.t({ code: "common.cancel", msg: "Cancel" })}
						</Button>
						<Button
							isDisabled={isFirstStep}
							onPress={handleBack}
							className="rounded-[0.57rem] border border-gray-300 px-[1.14rem] py-[0.8rem] font-medium data-[hovered]:bg-[#e6e6e6] data-[focus-visible]:shadow-[0_0_0_2px_#106cb8] data-[focus-visible]:outline-none data-[disabled]:opacity-50"
						>
							{ctx.t({ code: "common.back", msg: "Back" })}
						</Button>
					</div>
					{isLastStep ? (
						<Button
							isDisabled={fetcher.state !== "idle"}
							onPress={handleOpenSaveSubmit}
							className="rounded-[0.57rem] bg-[#004f91] px-[1.14rem] py-[0.8rem] font-medium text-white data-[hovered]:bg-[#106cb8] data-[focus-visible]:shadow-[0_0_0_2px_#106cb8] data-[focus-visible]:outline-none data-[disabled]:opacity-50"
						>
							{fetcher.state !== "idle"
								? ctx.t({ code: "common.submitting", msg: "Submitting…" })
								: ctx.t({
										code: "common.savesubmit",
										msg: "Save or submit",
									})}
						</Button>
					) : (
						<Button
							onPress={handleNext}
							className="rounded-[0.57rem] bg-[#004f91] px-[1.14rem] py-[0.8rem] font-medium text-white data-[hovered]:bg-[#106cb8] data-[focus-visible]:shadow-[0_0_0_2px_#106cb8] data-[focus-visible]:outline-none"
						>
							{ctx.t({ code: "common.next", msg: "Next" })}
						</Button>
					)}
				</div>
			</div>

			<DiscardDialogRac
				ctx={ctx}
				isOpen={isDiscardOpen}
				onOpenChange={setIsDiscardOpen}
				onDiscard={handleDiscard}
			/>

			<SaveSubmitDialogRac
				ctx={ctx}
				isOpen={isSaveSubmitOpen}
				onOpenChange={setIsSaveSubmitOpen}
				onConfirm={handleConfirmSaveSubmit}
				usersWithValidatorRole={usersWithValidatorRole}
				userRole={ld.user.role}
			/>
		</MainContainer>
	);
}
