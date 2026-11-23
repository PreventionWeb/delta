import { redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";

import { getAppContext } from "~/init.server";
import { requireUser } from "~/utils/auth";
import { CreateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/CreateHazardousEvent";
import { GetHazardousEventByIdUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardousEventById";
import { GetHazardTaxonomyOptionsUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase";
import { FindValidatorCandidatesUseCase } from "~/domains/validation-workflow/application/use-cases/FindValidatorCandidates";
import { ProcessWorkflowActionUseCase } from "~/domains/validation-workflow/application/use-cases/ProcessWorkflowAction";
import { resolveTenantId } from "~/domains/hazardous-events/presentation/web/resolveTenantId.server";
import {
	requireEditDataPermission,
	requireWorkflowActionAuthorized,
	requireValidValidatorIds,
} from "~/domains/hazardous-events/presentation/web/requestAuthorizationGuards.server";
import { parseHazardousEventFormData } from "~/domains/hazardous-events/presentation/web/parseHazardousEventFormData.server";
import {
	composeWorkflowAction,
	buildWorkflowComposerCallbacks,
} from "~/domains/hazardous-events/presentation/web/composeWorkflowAction.server";
import { throwHazardousEventLoaderError } from "~/domains/hazardous-events/presentation/web/throwHazardousEventLoaderError.server";
import {
	extractFieldError,
	extractCauseConflictError,
} from "~/domains/hazardous-events/presentation/web/extractFormFieldErrors";
import { HazardousEventFormPage } from "~/domains/hazardous-events/presentation/web/HazardousEventFormPage";
import { ConflictError, ValidationError } from "~/shared/errors";
import { getInstance } from "~/middleware/i18next.server";
import { MainContainer } from "~/frontend/container";
import { getLanguageAllowDefault } from "~/utils/lang.backend";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
	// Order matters: requireUser, then resolveTenantId before requireEditDataPermission (same
	// ordering rationale as 6a's requireViewDataPermission.server.ts).
	const session = await requireUser({ request, params });
	const tenantId = await resolveTenantId(request, params.lang ?? "en");
	const role = await requireEditDataPermission({ request });

	await getInstance(context).loadNamespaces(["hazardous-events", "common"]);

	const [taxonomyOptions, validatorCandidates] = await Promise.all([
		getAppContext().get(GetHazardTaxonomyOptionsUseCase).execute(),
		getAppContext()
			.get(FindValidatorCandidatesUseCase)
			.execute({ tenantId, excludingUserId: session.user.id }),
	]);

	// Legacy's own new.tsx?parent= prefill -- links the new event as an effect of an existing
	// one (Decision 13's picker writes this param). Reusing GetHazardousEventByIdUseCase's
	// tenant-scoped findById means a cross-tenant parent id 404s instead of a separate 403 --
	// narrower disclosure than legacy's two-branch check, same end result either way.
	const parentId = new URL(request.url).searchParams.get("parent") ?? "";
	let parent = null;
	if (parentId !== "") {
		try {
			const detail = await getAppContext()
				.get(GetHazardousEventByIdUseCase)
				.execute({ id: parentId, tenantId });
			parent = {
				id: detail.id,
				displayName:
					detail.specificHazardName ||
					detail.hazardClusterName ||
					detail.hazardTypeName ||
					"",
			};
		} catch (err) {
			throwHazardousEventLoaderError(err, {
				logMsg:
					"Unhandled error resolving ?parent= on hazardous-event create loader",
				url: request.url,
			});
		}
	}

	return { taxonomyOptions, validatorCandidates, parent, role: role ?? null };
}

export async function action({ request, params }: ActionFunctionArgs) {
	// Validated, not raw params.lang -- an unvalidated route param interpolated into a redirect
	// target is an open redirect (resolveTenantId.server.ts's own precedent, code review finding).
	const lang = getLanguageAllowDefault({ params });
	const session = await requireUser({ request, params });
	const tenantId = await resolveTenantId(request, lang);
	const role = await requireEditDataPermission({ request });

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
			logMsg: "Unhandled error parsing hazardous-event create form data",
			url: request.url,
		});
	}

	// Must run before CreateHazardousEventUseCase, not after -- a rejected request must not create
	// a row a retry would duplicate (design.md Decision 25). mappedAction is threaded into
	// composeWorkflowAction below -- one call site for this guard (SOLID review finding).
	const mappedAction = requireWorkflowActionAuthorized({
		parsed,
		actingUserRole: role,
		request,
	});

	// getValidCandidateIds has no id dependency, so it -- and the membership check it drives --
	// can run before the write too (design.md Decision 25), closing the one case
	// requireWorkflowActionAuthorized's synchronous checks can't: a non-empty but entirely
	// stale/tampered validator list.
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

	const createHazardousEventUseCase = getAppContext().get(
		CreateHazardousEventUseCase,
	);

	let created;
	try {
		created = await createHazardousEventUseCase.execute({
			tenantId,
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
			specificHazardLocalName: parsed.specificHazardLocalName,
			specificHazardNationalName: parsed.specificHazardNationalName,
			apiImportId: null,
			actingUserId: session.user.id,
			hazardDriverIds: [],
			attachments: parsed.attachments,
			fieldValues: [],
			customFieldValues: [],
			causeId: parsed.causeId,
			causalityExplanation: parsed.causalityExplanation,
			...(parsed.spatialObservation !== undefined
				? { spatialObservation: parsed.spatialObservation }
				: {}),
		});
	} catch (err) {
		// A field-mappable ValidationError returns data for inline display (task 9.10) instead
		// of throwing to the generic error boundary; every other error still throws as before.
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
			logMsg: "Unhandled error in hazardous-event create action",
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
		entityId: created.id,
		tenantId,
		actingUserId: session.user.id,
		actingUserRole: role,
		getRecordDisplayName: () => getRecordDisplayName(created.id),
		validatorUserIds,
	});

	if (result.attempted && result.outcome === "failed") {
		return redirect(
			`/${lang}/he-preview/edit/${created.id}?partial=transition-failed`,
		);
	}

	return redirect(`/${lang}/he-preview/${created.id}`);
}

export default function HazardousEventNewRoute() {
	const data = useLoaderData<typeof loader>();
	const actionData = useActionData<typeof action>();
	const { t } = useTranslation("hazardous-events");

	return (
		<MainContainer title={t("title")}>
			<HazardousEventFormPage
				mode="create"
				taxonomyOptions={data.taxonomyOptions}
				validatorCandidates={data.validatorCandidates}
				parent={data.parent}
				role={data.role}
				fieldErrors={
					actionData && "fieldErrors" in actionData
						? actionData.fieldErrors
						: undefined
				}
			/>
		</MainContainer>
	);
}
