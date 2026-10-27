import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";

import { getAppContext } from "~/init.server";
import { requireUser } from "~/utils/auth";
import { ListHazardousEventsUseCase } from "~/domains/hazardous-events/application/use-cases/ListHazardousEvents";
import { HazardousEventListPage } from "~/domains/hazardous-events/presentation/HazardousEventListPage";
import { parsePagination } from "~/domains/hazardous-events/presentation/parsePagination";
import { resolveTenantId } from "~/domains/hazardous-events/presentation/resolveTenantId.server";
import { throwHazardousEventLoaderError } from "~/domains/hazardous-events/presentation/throwHazardousEventLoaderError.server";
import { requireViewDataPermission } from "~/domains/hazardous-events/presentation/requireViewDataPermission.server";
import { MainContainer } from "~/frontend/container";
import { getInstance } from "~/middleware/i18next.server";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
	// Order matters, in both lines below: requireUser (parallel-loader layout gap, design.md
	// Decision 1), then resolveTenantId before requireViewDataPermission (see
	// requireViewDataPermission.server.ts for why reversing the last two mis-fires a 403).
	await requireUser({ request, params });
	const tenantId = await resolveTenantId(request, params.lang ?? "en");
	await requireViewDataPermission({ request });

	const { page, pageSize } = parsePagination(new URL(request.url).searchParams);
	const listHazardousEventsUseCase = getAppContext().get(
		ListHazardousEventsUseCase,
	);

	await getInstance(context).loadNamespaces(["hazardous-events", "common"]);

	try {
		return await listHazardousEventsUseCase.execute({
			tenantId,
			page,
			pageSize,
		});
	} catch (err) {
		throwHazardousEventLoaderError(err, {
			logMsg: "Unhandled error in hazardous-event list loader",
			url: request.url,
		});
	}
}

export default function HazardousEventListRoute() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation("hazardous-events");
	return (
		<MainContainer title={t("title")}>
			<HazardousEventListPage data={data} />
		</MainContainer>
	);
}
