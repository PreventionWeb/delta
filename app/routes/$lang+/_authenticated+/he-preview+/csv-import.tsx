import { useActionData, useNavigation, useParams } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";

import { getAppContext } from "~/init.server";
import { requireUser } from "~/utils/auth";
import { getInstance } from "~/middleware/i18next.server";
import { getLanguageAllowDefault } from "~/utils/lang.backend";
import { MainContainer } from "~/frontend/container";
import { ImportHazardousEventsCsvUseCase } from "~/domains/hazardous-events/application/use-cases/ImportHazardousEventsCsv";
import type { HazardousEventCsvImportResult } from "~/domains/hazardous-events/application/dto/HazardousEventCsvImportResult";
import { resolveTenantId } from "~/domains/hazardous-events/presentation/web/resolveTenantId.server";
import { requireEditDataPermission } from "~/domains/hazardous-events/presentation/web/requestAuthorizationGuards.server";
import { throwHazardousEventLoaderError } from "~/domains/hazardous-events/presentation/web/throwHazardousEventLoaderError.server";
import { HazardousEventErrorBoundary } from "~/domains/hazardous-events/presentation/web/HazardousEventErrorBoundary";
import { parseCsvUpload } from "~/domains/hazardous-events/presentation/web/csv/parseCsvUpload.server";
import { HazardousEventCsvImportPage } from "~/domains/hazardous-events/presentation/web/csv/HazardousEventCsvImportPage";

/** Shared guard order (D10): namespaces first so any error boundary is translated. */
async function requireImportAccess({
	request,
	params,
	context,
}: LoaderFunctionArgs) {
	await getInstance(context).loadNamespaces(["hazardous-events", "common"]);
	const lang = getLanguageAllowDefault({ params });
	const session = await requireUser({ request, params });
	const tenantId = await resolveTenantId(request, lang);
	const role = await requireEditDataPermission({ request });
	return { session, tenantId, role };
}

export async function loader(args: LoaderFunctionArgs) {
	await requireImportAccess(args);
	return {};
}

export async function action(
	args: ActionFunctionArgs,
): Promise<HazardousEventCsvImportResult> {
	const { session, tenantId, role } = await requireImportAccess(args);
	try {
		const importUseCase = getAppContext().get(ImportHazardousEventsCsvUseCase);
		const upload = await parseCsvUpload(args.request);
		if (!upload.ok) {
			return importUseCase.rejectUpload({
				tenantId,
				mode: upload.mode,
				fileError: upload.fileError,
			});
		}
		// Tenant and user come only from the session, never from the file (D2).
		return await importUseCase.execute({
			tenantId,
			actingUserId: session.user.id,
			role: role ?? null,
			mode: upload.mode,
			header: upload.header,
			rows: upload.rows,
			firstDataLine: upload.firstDataLine,
			lineNumbers: upload.lineNumbers,
		});
	} catch (err) {
		throwHazardousEventLoaderError(err, {
			logMsg: "Unhandled error in hazardous-event CSV import action",
			url: args.request.url,
		});
	}
}

export { HazardousEventErrorBoundary as ErrorBoundary };

export default function HazardousEventCsvImportRoute() {
	const result = useActionData<typeof action>();
	const navigation = useNavigation();
	const { lang } = useParams();
	const { t } = useTranslation("hazardous-events");
	return (
		<MainContainer title={t("csv.title")}>
			<HazardousEventCsvImportPage
				lang={lang ?? "en"}
				result={result}
				submitting={navigation.state === "submitting"}
			/>
		</MainContainer>
	);
}
