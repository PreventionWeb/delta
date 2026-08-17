import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { apiAuth } from "~/backend.server/models/api_key";
import { authLoaderApi } from "~/utils/auth";
import { isValidUUID } from "~/utils/id";
import {
	listAssessmentSectors,
	removeAssessmentSector,
} from "./sectors_api.server";

function getParams(params: LoaderFunctionArgs["params"]) {
	const disasterEventId = params.disasterEventId as string;
	const assessmentId = params.id as string;
	const sectorId = params.sectorId as string;
	if (!disasterEventId || !isValidUUID(disasterEventId)) {
		throw new Response("Invalid disasterEventId", { status: 400 });
	}
	if (!assessmentId || !isValidUUID(assessmentId)) {
		throw new Response("Invalid assessment id", { status: 400 });
	}
	if (!sectorId || !isValidUUID(sectorId)) {
		throw new Response("Invalid sector id", { status: 400 });
	}
	return { disasterEventId, assessmentId, sectorId };
}

export const loader = authLoaderApi(async (args: LoaderFunctionArgs) => {
	const { disasterEventId, assessmentId, sectorId } = getParams(args.params);
	const apiKey = await apiAuth(args.request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const data = await listAssessmentSectors({
		countryAccountsId,
		disasterEventId,
		assessmentId,
	});
	const found = data.find((row) => row.sectorId === sectorId);
	if (!found) {
		throw new Response("Sector not found", { status: 404 });
	}
	return Response.json(found);
});

export const action = async (args: ActionFunctionArgs) => {
	if (args.request.method !== "DELETE") {
		throw new Response(
			"Method Not Allowed: Only DELETE requests are supported",
			{
				status: 405,
			},
		);
	}

	const { disasterEventId, assessmentId, sectorId } = getParams(args.params);
	const apiKey = await apiAuth(args.request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	await removeAssessmentSector({
		countryAccountsId,
		disasterEventId,
		assessmentId,
		sectorId,
	});
	return new Response(null, { status: 204 });
};
