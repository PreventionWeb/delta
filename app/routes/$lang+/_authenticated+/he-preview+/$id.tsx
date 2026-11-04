import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";

import { getAppContext } from "~/init.server";
import { requireUser } from "~/utils/auth";
import { GetHazardousEventByIdUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardousEventById";
import { HazardousEventDetailPage } from "~/domains/hazardous-events/presentation/web/HazardousEventDetailPage";
import { resolveTenantId } from "~/domains/hazardous-events/presentation/web/resolveTenantId.server";
import { throwHazardousEventLoaderError } from "~/domains/hazardous-events/presentation/web/throwHazardousEventLoaderError.server";
import { requireViewDataPermission } from "~/domains/hazardous-events/presentation/web/requireViewDataPermission.server";
import { MainContainer } from "~/frontend/container";
import { getInstance } from "~/middleware/i18next.server";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
	// Order matters, in both lines below: requireUser (parallel-loader layout gap, design.md
	// Decision 1), then resolveTenantId before requireViewDataPermission (see
	// requireViewDataPermission.server.ts for why reversing the last two mis-fires a 403).
	await requireUser({ request, params });
	const tenantId = await resolveTenantId(request, params.lang ?? "en");
	// Captured (was previously discarded) -- design.md Decision 16 needs it to gate the detail
	// page's new Edit/add-cause links.
	const role = await requireViewDataPermission({ request });

	await getInstance(context).loadNamespaces(["hazardous-events", "common"]);

	const getHazardousEventByIdUseCase = getAppContext().get(
		GetHazardousEventByIdUseCase,
	);

	try {
		const dto = await getHazardousEventByIdUseCase.execute({
			id: params.id ?? "",
			tenantId,
		});
		return { ...dto, role };
	} catch (err) {
		throwHazardousEventLoaderError(err, {
			logMsg: "Unhandled error in hazardous-event detail loader",
			url: request.url,
		});
	}
}

export default function HazardousEventDetailRoute() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation("hazardous-events");
	return (
		<MainContainer title={t("title")}>
			<HazardousEventDetailPage data={data} role={data.role} />
		</MainContainer>
	);
}
