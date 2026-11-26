import type { LoaderFunctionArgs } from "react-router";

import { getAppContext } from "~/init.server";
import { requireUser } from "~/utils/auth";
import { getInstance } from "~/middleware/i18next.server";
import { getLanguageAllowDefault } from "~/utils/lang.backend";
import { ExportHazardousEventsCsvUseCase } from "~/domains/hazardous-events/application/use-cases/ExportHazardousEventsCsv";
import { resolveTenantId } from "~/domains/hazardous-events/presentation/web/resolveTenantId.server";
import { requireViewDataPermission } from "~/domains/hazardous-events/presentation/web/requireViewDataPermission.server";
import { throwHazardousEventLoaderError } from "~/domains/hazardous-events/presentation/web/throwHazardousEventLoaderError.server";
import {
	CSV_RESPONSE_HEADERS,
	serializeCsv,
} from "~/domains/hazardous-events/presentation/web/csv/serializeCsv";

/** Resource route (D10): every ViewData role gets every row of the tenant (OD-9). */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
	await getInstance(context).loadNamespaces(["hazardous-events", "common"]);
	const lang = getLanguageAllowDefault({ params });
	await requireUser({ request, params });
	const tenantId = await resolveTenantId(request, lang);
	await requireViewDataPermission({ request });

	try {
		const csv = await getAppContext()
			.get(ExportHazardousEventsCsvUseCase)
			.execute({ tenantId });
		return new Response(serializeCsv(csv.header, csv.rows), {
			status: 200,
			headers: CSV_RESPONSE_HEADERS,
		});
	} catch (err) {
		throwHazardousEventLoaderError(err, {
			logMsg: "Unhandled error in hazardous-event CSV export loader",
			url: request.url,
		});
	}
}
