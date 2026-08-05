import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";

import { getAppContext } from "~/init.server";
import { GetNoticeByIdUseCase } from "~/domains/notices/application/use-cases/GetNoticeById";
import { NoticeDetailPage } from "~/domains/notices/presentation/NoticeDetailPage";
import { NoticeErrorBoundary } from "~/domains/notices/presentation/NoticeErrorBoundary";
import { resolveTenantId } from "~/domains/notices/presentation/resolveTenantId.server";
import { throwNoticeLoaderError } from "~/domains/notices/presentation/throwNoticeLoaderError.server";
import { MainContainer } from "~/frontend/container";
import { getInstance } from "~/middleware/i18next.server";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
	const tenantId = await resolveTenantId(request, params.lang ?? "en");

	// Both namespaces are loaded on both routes — see design.md Decision 3.
	await getInstance(context).loadNamespaces(["notices", "common"]);

	const getNoticeByIdUseCase = getAppContext().get(GetNoticeByIdUseCase);

	try {
		return await getNoticeByIdUseCase.execute({
			id: params.id ?? "",
			tenantId,
		});
	} catch (err) {
		throwNoticeLoaderError(err, {
			logMsg: "Unhandled error in notice detail loader",
			url: request.url,
		});
	}
}

export default function NoticeDetailRoute() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation("notices");
	return (
		<MainContainer title={t("title")}>
			<NoticeDetailPage data={data} />
		</MainContainer>
	);
}

export { NoticeErrorBoundary as ErrorBoundary };
