import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";

import { getAppContext } from "~/init.server";
import { ListNoticesUseCase } from "~/domains/notices/application/use-cases/ListNotices";
import { NoticeListPage } from "~/domains/notices/presentation/NoticeListPage";
import { NoticeErrorBoundary } from "~/domains/notices/presentation/NoticeErrorBoundary";
import { parsePagination } from "~/domains/notices/presentation/parsePagination";
import { resolveTenantId } from "~/domains/notices/presentation/resolveTenantId.server";
import { throwNoticeLoaderError } from "~/domains/notices/presentation/throwNoticeLoaderError.server";
import { MainContainer } from "~/frontend/container";
import { getInstance } from "~/middleware/i18next.server";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
	const tenantId = await resolveTenantId(request, params.lang ?? "en");
	const { page, pageSize } = parsePagination(new URL(request.url));
	const listNoticesUseCase = getAppContext().get(ListNoticesUseCase);

	// Both namespaces are loaded on both routes — see design.md Decision 3.
	await getInstance(context).loadNamespaces(["notices", "common"]);

	try {
		return await listNoticesUseCase.execute({ tenantId, page, pageSize });
	} catch (err) {
		throwNoticeLoaderError(err, {
			logMsg: "Unhandled error in notices list loader",
			url: request.url,
		});
	}
}

export default function NoticesIndexRoute() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation("notices");
	return (
		<MainContainer title={t("title")}>
			<NoticeListPage data={data} />
		</MainContainer>
	);
}

export { NoticeErrorBoundary as ErrorBoundary };
