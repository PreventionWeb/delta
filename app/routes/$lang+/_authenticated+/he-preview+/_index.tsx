import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";

import { getAppContext } from "~/init.server";
import { requireUser } from "~/utils/auth";
import { getCountrySettingsFromSession } from "~/utils/session";
import { ListHazardousEventsUseCase } from "~/domains/hazardous-events/application/use-cases/ListHazardousEvents";
import { GetHazardTaxonomyOptionsUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase";
import { HazardousEventListPage } from "~/domains/hazardous-events/presentation/web/HazardousEventListPage";
import { HazardousEventListActions } from "~/domains/hazardous-events/presentation/web/HazardousEventListActions";
import { HazardousEventListHeader } from "~/domains/hazardous-events/presentation/web/HazardousEventListHeader";
import { parsePagination } from "~/domains/hazardous-events/presentation/web/parsePagination";
import { parseHazardousEventListFilters } from "~/domains/hazardous-events/presentation/web/parseHazardousEventListFilters";
import { resolveTenantId } from "~/domains/hazardous-events/presentation/web/resolveTenantId.server";
import { throwHazardousEventLoaderError } from "~/domains/hazardous-events/presentation/web/throwHazardousEventLoaderError.server";
import { requireViewDataPermission } from "~/domains/hazardous-events/presentation/web/requireViewDataPermission.server";
import { MainContainer } from "~/frontend/container";
import { getInstance } from "~/middleware/i18next.server";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
	// Order matters, in both lines below: requireUser (parallel-loader layout gap, design.md
	// Decision 1), then resolveTenantId before requireViewDataPermission (see
	// requireViewDataPermission.server.ts for why reversing the last two mis-fires a 403).
	const userSession = await requireUser({ request, params });
	const tenantId = await resolveTenantId(request, params.lang ?? "en");
	const role = await requireViewDataPermission({ request });

	const searchParams = new URL(request.url).searchParams;
	const { page, pageSize } = parsePagination(searchParams);
	const filters = parseHazardousEventListFilters(searchParams);
	const listHazardousEventsUseCase = getAppContext().get(
		ListHazardousEventsUseCase,
	);
	const getHazardTaxonomyOptionsUseCase = getAppContext().get(
		GetHazardTaxonomyOptionsUseCase,
	);

	await getInstance(context).loadNamespaces(["hazardous-events", "common"]);

	try {
		const [{ items, totalCount, unfilteredTotalCount }, taxonomyOptions] =
			await Promise.all([
				listHazardousEventsUseCase.execute({
					tenantId,
					userId: userSession.user.id,
					role: role ?? null,
					page,
					pageSize,
					filters,
				}),
				getHazardTaxonomyOptionsUseCase.execute(),
			]);
		// New to this loader (design.md Decision 15) -- same fallback legacy's own
		// HazardEventHeader uses, not a domain-layer query.
		const settings = await getCountrySettingsFromSession(request);
		const instanceName = settings?.websiteName || "DELTA Resilience";
		return {
			items,
			totalCount,
			unfilteredTotalCount,
			taxonomyOptions,
			role,
			instanceName,
		};
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
			<HazardousEventListHeader
				totalCount={data.unfilteredTotalCount}
				instanceName={data.instanceName}
			/>
			<HazardousEventListActions role={data.role} />
			<HazardousEventListPage data={data} />
		</MainContainer>
	);
}
