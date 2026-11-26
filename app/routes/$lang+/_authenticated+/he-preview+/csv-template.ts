import type { LoaderFunctionArgs } from "react-router";

import { getAppContext } from "~/init.server";
import { requireUser } from "~/utils/auth";
import { getInstance } from "~/middleware/i18next.server";
import { getLanguageAllowDefault } from "~/utils/lang.backend";
import { GetHazardousEventCsvTemplateUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardousEventCsvTemplate";
import { isCsvImportMode } from "~/domains/hazardous-events/application/csv/hazardousEventCsvColumns";
import { resolveTenantId } from "~/domains/hazardous-events/presentation/web/resolveTenantId.server";
import { requireEditDataPermission } from "~/domains/hazardous-events/presentation/web/requestAuthorizationGuards.server";
import { throwHazardousEventLoaderError } from "~/domains/hazardous-events/presentation/web/throwHazardousEventLoaderError.server";
import {
	CSV_RESPONSE_HEADERS,
	serializeCsv,
} from "~/domains/hazardous-events/presentation/web/csv/serializeCsv";
import { NotFoundError } from "~/shared/errors";

/** Template download per mode (OD-17); unknown mode is a 404 envelope. */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
	await getInstance(context).loadNamespaces(["hazardous-events", "common"]);
	const lang = getLanguageAllowDefault({ params });
	await requireUser({ request, params });
	await resolveTenantId(request, lang);
	await requireEditDataPermission({ request });

	const mode = new URL(request.url).searchParams.get("mode") ?? "";
	try {
		if (!isCsvImportMode(mode)) {
			throw new NotFoundError("CSV template", mode);
		}
		const template = await getAppContext()
			.get(GetHazardousEventCsvTemplateUseCase)
			.execute({ mode });
		return new Response(serializeCsv(template.header, [template.row]), {
			status: 200,
			headers: {
				...CSV_RESPONSE_HEADERS,
				"Content-Disposition": `attachment; filename="${template.filename}"`,
			},
		});
	} catch (err) {
		throwHazardousEventLoaderError(err, {
			logMsg: "Unhandled error in hazardous-event CSV template loader",
			url: request.url,
		});
	}
}
