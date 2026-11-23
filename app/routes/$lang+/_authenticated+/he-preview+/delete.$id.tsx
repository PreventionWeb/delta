import { data } from "react-router";
import type { ActionFunctionArgs } from "react-router";

import { getAppContext } from "~/init.server";
import { requireUser } from "~/utils/auth";
import { getUserRoleFromSession, redirectWithMessage } from "~/utils/session";
import { getLanguageAllowDefault } from "~/utils/lang.backend";
import { getInstance } from "~/middleware/i18next.server";
import { DomainError } from "~/shared/errors/DomainError";
import { GetHazardousEventByIdUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardousEventById";
import { DeleteHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/DeleteHazardousEvent";
import { resolveTenantId } from "~/domains/hazardous-events/presentation/web/resolveTenantId.server";
import {
	requireDeleteRole,
	requireStatusAwareDeletePermission,
} from "~/domains/hazardous-events/presentation/web/requestAuthorizationGuards.server";
import { throwHazardousEventLoaderError } from "~/domains/hazardous-events/presentation/web/throwHazardousEventLoaderError.server";
import {
	mapDeleteErrorToMessageKeys,
	type DeleteHazardousEventFailure,
} from "~/domains/hazardous-events/presentation/web/mapDeleteErrorToMessageKey";

/** Expected failures, including authorization, are returned, not thrown: a thrown Response from a
 * fetcher action lands in the root error boundary (design.md D1). */
function deleteFailure(err: unknown, url: string) {
	const messageKeys = mapDeleteErrorToMessageKeys(err);
	if (messageKeys === null || !(err instanceof DomainError)) {
		throwHazardousEventLoaderError(err, {
			logMsg: "Unhandled error in hazardous-event delete action",
			url,
		});
	}
	return data<DeleteHazardousEventFailure>(
		{ ok: false, messageKeys },
		{ status: err.statusHint },
	);
}

export async function action({ request, params, context }: ActionFunctionArgs) {
	// Validated, never raw params.lang: it is interpolated into the redirect target.
	const lang = getLanguageAllowDefault({ params });
	// Outside the try: their redirects (login, select-instance) must propagate.
	const session = await requireUser({ request, params });
	const tenantId = await resolveTenantId(request, lang);
	const role = await getUserRoleFromSession(request);
	const id = params.id ?? "";

	try {
		requireDeleteRole(role);
		const { workflowStatus } = await getAppContext()
			.get(GetHazardousEventByIdUseCase)
			.execute({ id, tenantId });
		requireStatusAwareDeletePermission({ role, workflowStatus });
		await getAppContext()
			.get(DeleteHazardousEventUseCase)
			.execute({ id, tenantId, actingUserId: session.user.id });
	} catch (err) {
		return deleteFailure(err, request.url);
	}

	const i18n = getInstance(context);
	await i18n.loadNamespaces("hazardous-events");
	return redirectWithMessage({ request, params: { lang } }, "/he-preview", {
		type: "info",
		text: i18n.t("delete.success", { ns: "hazardous-events" }),
	});
}
