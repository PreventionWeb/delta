import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";

import { getAppContext } from "~/init.server";
import { requireUser } from "~/utils/auth";
import { GetHazardousEventByIdUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardousEventById";
import { HazardousEventDetailPage } from "~/domains/hazardous-events/presentation/web/HazardousEventDetailPage";
import { resolveTenantId } from "~/domains/hazardous-events/presentation/web/resolveTenantId.server";
import { throwHazardousEventLoaderError } from "~/domains/hazardous-events/presentation/web/throwHazardousEventLoaderError.server";
import { HazardousEventErrorBoundary } from "~/domains/hazardous-events/presentation/web/HazardousEventErrorBoundary";
import { requireViewDataPermission } from "~/domains/hazardous-events/presentation/web/requireViewDataPermission.server";
import { MainContainer } from "~/frontend/container";
import { getInstance } from "~/middleware/i18next.server";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
	// Loaded first so an error boundary for any failure below is translated.
	await getInstance(context).loadNamespaces(["hazardous-events", "common"]);

	// Order matters: requireUser, then resolveTenantId, then requireViewDataPermission --
	// swapping the last two mis-fires a 403 (see requireViewDataPermission.server.ts).
	await requireUser({ request, params });
	const tenantId = await resolveTenantId(request, params.lang ?? "en");
	// Still a real ViewData gate (403s); return value discarded -- the page no longer needs the role (design.md Decision 11).
	await requireViewDataPermission({ request });

	const getHazardousEventByIdUseCase = getAppContext().get(
		GetHazardousEventByIdUseCase,
	);

	try {
		const dto = await getHazardousEventByIdUseCase.execute({
			id: params.id ?? "",
			tenantId,
		});
		return { ...dto };
	} catch (err) {
		throwHazardousEventLoaderError(err, {
			logMsg: "Unhandled error in hazardous-event detail loader",
			url: request.url,
		});
	}
}

export { HazardousEventErrorBoundary as ErrorBoundary };

export default function HazardousEventDetailRoute() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation("hazardous-events");
	return (
		<MainContainer title={t("title")}>
			<HazardousEventDetailPage data={data} />
		</MainContainer>
	);
}
