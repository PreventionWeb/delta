import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import { dr } from "~/db.server";

import {
	disRecSectorsByIdTx,
	deleteRecordsDeleteById,
} from "~/backend.server/models/disaster_record__sectors";

import { disruptionDeleteBySectorId } from "~/backend.server/models/disruption";
import { damagesDeleteBySectorId } from "~/backend.server/models/damages";
import { lossesDeleteBySectorId } from "~/backend.server/models/losses";
import { updateTotalsUsingDisasterRecordId } from "~/backend.server/models/analytics/disaster-events-cost-calculator";

import { redirectLangFromRoute } from "~/utils/url.backend";

import { disasterRecordsById } from "~/backend.server/models/disaster_record";
import { requireDisasterRecordAccess } from "../requireDisasterRecordAccess.server";

export const loader = authLoaderWithPerm("EditData", async (_loaderArgs) => {
	return new Response("Method Not Allowed", { status: 405 });
});

export const action = authActionWithPerm("EditData", async (actionArgs) => {
	const { params, request } = actionArgs;

	// Route guard: ensures tenant is selected, record exists for that tenant,
	// and current user has access to proceed with this disaster record.
	const { countryAccountsId } = await requireDisasterRecordAccess(
		request,
		params.disRecId,
		() => redirectLangFromRoute(actionArgs, "/user/select-instance"),
	);

	// Parse the request URL
	const parsedUrl = new URL(request.url);

	// Extract query string parameters
	const queryParams = parsedUrl.searchParams;
	const disasterRecordId = params.disRecId || "";
	const xId = queryParams.get("id") || "";
	if (!xId) {
		return Response.json({}, { status: 404 });
	}

	const disasterRecord = await disasterRecordsById(
		disasterRecordId,
		countryAccountsId,
	);
	if (!disasterRecord) {
		return Response.json({}, { status: 404 });
	}

	const deleted = await dr.transaction(async (tx) => {
		let record;
		try {
			record = await disRecSectorsByIdTx(tx, xId, countryAccountsId);
		} catch {
			return false;
		}

		if (record.disasterRecordId !== disasterRecord.id) {
			return false;
		}

		await damagesDeleteBySectorId(record.disasterRecordId, record.sectorId, tx);
		await disruptionDeleteBySectorId(
			record.disasterRecordId,
			record.sectorId,
			tx,
		);
		await lossesDeleteBySectorId(record.disasterRecordId, record.sectorId, tx);
		await deleteRecordsDeleteById(xId, tx);
		await updateTotalsUsingDisasterRecordId(tx, record.disasterRecordId);
		return true;
	});

	if (!deleted) {
		return Response.json({}, { status: 404 });
	}

	return redirectLangFromRoute(
		actionArgs,
		"/disaster-record/edit/" + params.disRecId,
	);
});
