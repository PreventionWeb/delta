import { lossesTable } from "~/drizzle/schema/lossesTable";
import { dr } from "~/db.server";
import { asc, eq } from "drizzle-orm";
import { csvExportLoader } from "~/backend.server/handlers/form/csv_export";
import { DisasterRecordsRepository } from "~/db/queries/disasterRecordsRepository";
import { getCountryAccountsIdFromSession } from "~/utils/session";

export const loader = csvExportLoader({
	table: lossesTable,
	fetchData: async (_ctx, request, params) => {
		const recordId = params.disRecId;
		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		if (!countryAccountsId) {
			throw new Response("Unauthorized", { status: 401 });
		}
		if (!recordId) {
			throw new Response("Not Found", { status: 404 });
		}
		const records =
			await DisasterRecordsRepository.getByIdAndCountryAccountsId(
				recordId,
				countryAccountsId,
			);
		if (!records || records.length === 0) {
			throw new Response("Not Found", { status: 404 });
		}
		return dr.query.lossesTable.findMany({
			where: eq(lossesTable.recordId, recordId),
			orderBy: [asc(lossesTable.id)],
		});
	},
});
