import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";

import { requireUser } from "~/utils/auth";
import { ListHazardousEventsUseCase } from "~/domains/hazardous-events/application/use-cases/ListHazardousEvents";
import { GetHazardTaxonomyOptionsUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase";
import { HazardousEventPickerPage } from "~/domains/hazardous-events/presentation/web/HazardousEventPickerPage";
import { parsePagination } from "~/domains/hazardous-events/presentation/web/parsePagination";
import { parseHazardousEventListFilters } from "~/domains/hazardous-events/presentation/web/parseHazardousEventListFilters";
import { resolveTenantId } from "~/domains/hazardous-events/presentation/web/resolveTenantId.server";
import { requireEditDataPermission } from "~/domains/hazardous-events/presentation/web/requestAuthorizationGuards.server";
import { throwHazardousEventLoaderError } from "~/domains/hazardous-events/presentation/web/throwHazardousEventLoaderError.server";
import { MainContainer } from "~/frontend/container";
import { getAppContext } from "~/init.server";
import { getInstance } from "~/middleware/i18next.server";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
	// Same EditData gate as new.tsx/edit.$id.tsx -- the picker is only ever reachable from the
	// create/edit form (design.md Decision 13).
	const userSession = await requireUser({ request, params });
	const tenantId = await resolveTenantId(request, params.lang ?? "en");
	const role = await requireEditDataPermission({ request });

	await getInstance(context).loadNamespaces(["hazardous-events", "common"]);

	const searchParams = new URL(request.url).searchParams;
	const { page, pageSize } = parsePagination(searchParams);
	const filters = parseHazardousEventListFilters(searchParams);
	const listHazardousEventsUseCase = getAppContext().get(
		ListHazardousEventsUseCase,
	);
	const getHazardTaxonomyOptionsUseCase = getAppContext().get(
		GetHazardTaxonomyOptionsUseCase,
	);

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
		return {
			items,
			totalCount,
			unfilteredTotalCount,
			taxonomyOptions,
			// Resolved above for the use case call -- also returned so the reused filter bar sees
			// the real role, not always null (code review finding).
			role: role ?? null,
		};
	} catch (err) {
		throwHazardousEventLoaderError(err, {
			logMsg: "Unhandled error in hazardous-event picker loader",
			url: request.url,
		});
	}
}

export default function HazardousEventPickerRoute() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation("hazardous-events");
	return (
		<MainContainer title={t("picker.title")}>
			<HazardousEventPickerPage data={data} />
		</MainContainer>
	);
}
