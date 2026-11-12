import { redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";

import { getAppContext } from "~/init.server";
import { requireUser } from "~/utils/auth";
import { GetHazardousEventByIdUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardousEventById";
import { UpdateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent";
import { GetHazardTaxonomyOptionsUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase";
import { FindValidatorCandidatesUseCase } from "~/domains/validation-workflow/application/use-cases/FindValidatorCandidates";
import { ProcessWorkflowActionUseCase } from "~/domains/validation-workflow/application/use-cases/ProcessWorkflowAction";
import { resolveTenantId } from "~/domains/hazardous-events/presentation/web/resolveTenantId.server";
import {
	requireEditDataPermission,
	requireStatusAwareEditPermission,
	requireWorkflowActionAuthorized,
	requireValidValidatorIds,
} from "~/domains/hazardous-events/presentation/web/requestAuthorizationGuards.server";
import { throwHazardousEventLoaderError } from "~/domains/hazardous-events/presentation/web/throwHazardousEventLoaderError.server";
import { parseHazardousEventFormData } from "~/domains/hazardous-events/presentation/web/parseHazardousEventFormData.server";
import {
	composeWorkflowAction,
	buildWorkflowComposerCallbacks,
} from "~/domains/hazardous-events/presentation/web/composeWorkflowAction.server";
import {
	extractFieldError,
	extractCauseConflictError,
} from "~/domains/hazardous-events/presentation/web/extractFormFieldErrors";
import { HazardousEventFormPage } from "~/domains/hazardous-events/presentation/web/HazardousEventFormPage";
import { mapAttachmentsToWidgetShape } from "~/domains/hazardous-events/presentation/web/mapAttachmentsToWidgetShape";
import { ConflictError, ValidationError } from "~/shared/errors";
import { getInstance } from "~/middleware/i18next.server";
import { MainContainer } from "~/frontend/container";
import { getLanguageAllowDefault } from "~/utils/lang.backend";

/** Shared by loader/action -- both enforce the flat + status-aware gates before doing anything
 * else (design.md Decision 2/11), fetching the event once to learn its workflowStatus. */
async function requireEditableEvent(args: {
	request: Request;
	params: { lang?: string; id?: string };
}) {
	const { request, params } = args;
	const session = await requireUser({ request, params });
	const tenantId = await resolveTenantId(request, params.lang ?? "en");
	const role = await requireEditDataPermission({ request });

	const getHazardousEventByIdUseCase = getAppContext().get(
		GetHazardousEventByIdUseCase,
	);
	let event;
	try {
		event = await getHazardousEventByIdUseCase.execute({
			id: params.id ?? "",
			tenantId,
		});
	} catch (err) {
		throwHazardousEventLoaderError(err, {
			logMsg: "Unhandled error in hazardous-event edit loader",
			url: request.url,
		});
	}

	requireStatusAwareEditPermission({
		role,
		workflowStatus: event.workflowStatus,
		request,
	});

	return { session, tenantId, role, event };
}

export async function loader({ request, params, context }: LoaderFunctionArgs) {
	const { session, tenantId, role, event } = await requireEditableEvent({
		request,
		params,
	});

	await getInstance(context).loadNamespaces(["hazardous-events", "common"]);

	const [taxonomyOptions, validatorCandidates] = await Promise.all([
		getAppContext().get(GetHazardTaxonomyOptionsUseCase).execute(),
		getAppContext()
			.get(FindValidatorCandidatesUseCase)
			.execute({ tenantId, excludingUserId: session.user.id }),
	]);

	const partial =
		new URL(request.url).searchParams.get("partial") === "transition-failed";

	return {
		event,
		taxonomyOptions,
		validatorCandidates,
		partial,
		role: role ?? null,
	};
}

export async function action({ request, params }: ActionFunctionArgs) {
	// Validated, not raw params.lang -- an unvalidated route param interpolated into a redirect
	// target is an open redirect (resolveTenantId.server.ts's own precedent, code review finding).
	const lang = getLanguageAllowDefault({ params });
	const { session, tenantId, role, event } = await requireEditableEvent({
		request,
		params,
	});

	const formData = await request.formData();
	// A malformed attachments payload now throws (Gate 10 finding: a dropped item used to mean
	// "lost on save," now it means "removed," which deletes a real file) -- routed through the
	// same structured-error helper every other pre-write guard in this action already uses,
	// instead of escaping to the generic error boundary.
	let parsed: ReturnType<typeof parseHazardousEventFormData>;
	try {
		parsed = parseHazardousEventFormData(formData);
	} catch (err) {
		throwHazardousEventLoaderError(err, {
			logMsg: "Unhandled error parsing hazardous-event edit form data",
			url: request.url,
		});
	}

	// Must run before UpdateHazardousEventUseCase, not after -- a rejected request must not silently
	// apply its content edit anyway (design.md Decision 25). mappedAction is threaded into
	// composeWorkflowAction below -- one call site for this guard (SOLID review finding).
	const mappedAction = requireWorkflowActionAuthorized({
		parsed,
		actingUserRole: role,
		request,
	});

	// getValidCandidateIds has no id dependency, so it -- and the membership check it drives --
	// can run before the write too (design.md Decision 25), closing the one case
	// requireWorkflowActionAuthorized's synchronous checks can't: a non-empty but entirely
	// stale/tampered validator list. event.id is already known here, but getRecordDisplayName
	// must still be called AFTER the write below (to pick up a classification change made in the
	// same submission), so only getValidCandidateIds is used this early.
	const { getRecordDisplayName, getValidCandidateIds } =
		buildWorkflowComposerCallbacks({
			tenantId,
			actingUserId: session.user.id,
		});
	const validatorUserIds = await requireValidValidatorIds({
		mappedAction,
		parsed,
		getValidCandidateIds,
		request,
	});

	const updateHazardousEventUseCase = getAppContext().get(
		UpdateHazardousEventUseCase,
	);

	try {
		await updateHazardousEventUseCase.execute({
			id: event.id,
			tenantId,
			actingUserId: session.user.id,
			specificHazardId: parsed.specificHazardId,
			startDate: parsed.startDate,
			endDate: parsed.endDate,
			nationalSpecification: parsed.nationalSpecification,
			description: parsed.description,
			chainsExplanation: parsed.chainsExplanation,
			magnitude: parsed.magnitude,
			recordOriginator: parsed.recordOriginator,
			dataSource: parsed.dataSource,
			hazardousEventStatus: parsed.hazardousEventStatus,
			// specificHazardLocalName/specificHazardNationalName aren't part of this form --
			// omitted entirely (not sent as null) so they stay unchanged, same treatment as
			// hazardDriverIds/fieldValues.
			attachments: parsed.attachments,
			// No current-cause field to prefill against, so only touch causeId when the user
			// actually used the parent picker this submission.
			...(parsed.causeIdChanged
				? {
						causeId: parsed.causeId ?? null,
						causalityExplanation: parsed.causalityExplanation,
					}
				: {}),
			// Avoids appending a new observation row on every plain save.
			...(parsed.spatialObservationChanged &&
			parsed.spatialObservation !== undefined
				? { spatialObservation: parsed.spatialObservation }
				: {}),
		});
	} catch (err) {
		if (err instanceof ValidationError) {
			const fieldError = extractFieldError(err);
			if (fieldError !== null) {
				return {
					success: false as const,
					fieldErrors: { [fieldError.field]: [fieldError.message] },
				};
			}
		}
		if (err instanceof ConflictError) {
			const fieldError = extractCauseConflictError(err);
			if (fieldError !== null) {
				return {
					success: false as const,
					fieldErrors: { [fieldError.field]: [fieldError.message] },
				};
			}
		}
		throwHazardousEventLoaderError(err, {
			logMsg: "Unhandled error in hazardous-event edit action",
			url: request.url,
		});
	}

	const processWorkflowActionUseCase = getAppContext().get(
		ProcessWorkflowActionUseCase,
	);
	const result = await composeWorkflowAction({
		processWorkflowActionUseCase,
		mappedAction,
		parsed,
		entityId: event.id,
		tenantId,
		actingUserId: session.user.id,
		actingUserRole: role,
		getRecordDisplayName: () => getRecordDisplayName(event.id),
		validatorUserIds,
	});

	if (result.attempted && result.outcome === "failed") {
		return redirect(
			`/${lang}/he-preview/edit/${event.id}?partial=transition-failed`,
		);
	}

	return redirect(`/${lang}/he-preview/${event.id}`);
}

export default function HazardousEventEditRoute() {
	const data = useLoaderData<typeof loader>();
	const actionData = useActionData<typeof action>();
	const { t } = useTranslation("hazardous-events");
	const { event } = data;

	return (
		<MainContainer title={t("title")}>
			<HazardousEventFormPage
				mode="edit"
				taxonomyOptions={data.taxonomyOptions}
				validatorCandidates={data.validatorCandidates}
				parent={
					event.cause
						? { id: event.cause.id, displayName: event.cause.displayName }
						: null
				}
				role={data.role}
				partialFailure={data.partial}
				workflowStatus={event.workflowStatus}
				fieldErrors={
					actionData && "fieldErrors" in actionData
						? actionData.fieldErrors
						: undefined
				}
				initialValues={{
					specificHazardId: event.specificHazardId,
					startDate: event.startDate,
					endDate: event.endDate,
					nationalSpecification: event.nationalSpecification,
					description: event.description,
					chainsExplanation: event.chainsExplanation,
					magnitude: event.magnitude,
					recordOriginator: event.recordOriginator,
					dataSource: event.dataSource,
					hazardousEventStatus: event.hazardousEventStatus,
					attachments: mapAttachmentsToWidgetShape(event.attachments, {
						tenantId: event.tenantId,
						hazardousEventId: event.id,
					}),
				}}
			/>
		</MainContainer>
	);
}
