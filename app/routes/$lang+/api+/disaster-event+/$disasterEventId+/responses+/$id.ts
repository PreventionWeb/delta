import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authLoaderApi } from "~/utils/auth";
import { apiAuth } from "~/backend.server/models/api_key";
import { isValidUUID } from "~/utils/id";
import {
	deleteResponseForTenant,
	getResponseForTenantById,
	updateResponseForTenant,
} from "~/routes/$lang+/api+/disaster-event+/responses+/response_api.server";

function getRouteParams(params: LoaderFunctionArgs["params"]) {
	const disasterEventId = params.disasterEventId as string;
	const id = params.id as string;
	if (!disasterEventId || !isValidUUID(disasterEventId)) {
		throw new Response("Invalid disasterEventId", { status: 400 });
	}
	if (!id || !isValidUUID(id)) {
		throw new Response("Invalid response id", { status: 400 });
	}
	return { disasterEventId, id };
}

export const loader = authLoaderApi(async (args: LoaderFunctionArgs) => {
	const { disasterEventId, id } = getRouteParams(args.params);
	const apiKey = await apiAuth(args.request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const response = await getResponseForTenantById({
		countryAccountsId,
		id,
	});
	if (!response || response.disasterEventId !== disasterEventId) {
		throw new Response("Response not found", { status: 404 });
	}

	return Response.json(response);
});

export const action = async (args: ActionFunctionArgs) => {
	const { disasterEventId, id } = getRouteParams(args.params);
	const apiKey = await apiAuth(args.request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const existing = await getResponseForTenantById({ countryAccountsId, id });
	if (!existing || existing.disasterEventId !== disasterEventId) {
		throw new Response("Response not found", { status: 404 });
	}

	if (args.request.method === "PUT") {
		const payload = await args.request.json();
		const updated = await updateResponseForTenant({
			countryAccountsId,
			id,
			payload: {
				...payload,
				disasterEventId,
			},
		});
		return Response.json(updated);
	}

	if (args.request.method === "DELETE") {
		await deleteResponseForTenant({ countryAccountsId, id });
		return new Response(null, { status: 204 });
	}

	throw new Response("Method Not Allowed: Only PUT or DELETE are supported", {
		status: 405,
	});
};
