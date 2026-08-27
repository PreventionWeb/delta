import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { apiAuth } from "~/backend.server/models/api_key";
import { authLoaderApi } from "~/utils/auth";
import { isValidUUID } from "~/utils/id";
import {
	addAssessmentSector,
	listAssessmentSectors,
	replaceAssessmentSectors,
} from "./sectors_api.server";

function getParams(params: LoaderFunctionArgs["params"]) {
	const disasterEventId = params.disasterEventId as string;
	const assessmentId = params.id as string;
	if (!disasterEventId || !isValidUUID(disasterEventId)) {
		throw new Response("Invalid disasterEventId", { status: 400 });
	}
	if (!assessmentId || !isValidUUID(assessmentId)) {
		throw new Response("Invalid assessment id", { status: 400 });
	}
	return { disasterEventId, assessmentId };
}

export const loader = authLoaderApi(async (args: LoaderFunctionArgs) => {
	const { disasterEventId, assessmentId } = getParams(args.params);
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

	return Response.json(data);
});

export const action = async (args: ActionFunctionArgs) => {
	if (args.request.method !== "POST" && args.request.method !== "PUT") {
		throw new Response(
			"Method Not Allowed: Only POST and PUT requests are supported",
			{ status: 405 },
		);
	}

	const { disasterEventId, assessmentId } = getParams(args.params);
	const apiKey = await apiAuth(args.request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const payload = await args.request.json();
	if (args.request.method === "POST") {
		const created = await addAssessmentSector({
			countryAccountsId,
			disasterEventId,
			assessmentId,
			payload,
		});
		return Response.json(created, { status: 201 });
	}

	const updated = await replaceAssessmentSectors({
		countryAccountsId,
		disasterEventId,
		assessmentId,
		payload,
	});
	return Response.json(updated);
};
