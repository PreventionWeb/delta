import { authLoaderApi } from "~/utils/auth";
import { ActionFunction, ActionFunctionArgs } from "react-router";
import { apiAuth } from "~/backend.server/models/api_key";
import { isValidUUID } from "~/utils/id";
import {
	deleteAllDataByDisasterRecordId,
	disasterRecordsById,
} from "~/backend.server/models/disaster_record";
import { BackendContext } from "~/backend.server/context";

export const loader = authLoaderApi(async () => {
	return Response.json("Use DELETE");
});

export const action: ActionFunction = async (args: ActionFunctionArgs) => {
	const ctx = new BackendContext(args);
	const { request } = args;
	const id = args.params.id as string;
	let statusHeader: number = 200;

	if (request.method !== "DELETE") {
		throw new Response(
			"Method Not Allowed: Only DELETE requests are supported",
			{
				status: 405,
			},
		);
	}
	if (!id || !isValidUUID(id)) {
		throw new Response("Invalid ID", { status: 400 });
	}

	const apiKey = await apiAuth(request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const record = await disasterRecordsById(id, countryAccountsId);
	if (!record) {
		throw new Response("Not Found", { status: 404 });
	}

	const deleteRes = await deleteAllDataByDisasterRecordId(
		ctx,
		id,
		countryAccountsId,
	).catch((err) => {
		if (err.code && err.code === "23503") {
			statusHeader = 500;
			return {
				ok: false,
				error:
					"Child records of this disaster record exist. Please delete them first.",
			};
		}

		return {
			ok: false,
			error: err instanceof Error ? err.message : "Unknown error",
		};
	});

	if (!deleteRes.ok && statusHeader === 200) {
		const errorMessage =
			typeof (deleteRes as { error?: unknown }).error === "string"
				? (deleteRes as { error: string }).error
				: "";

		if (
			errorMessage.includes(
				"only published or validated disaster record linked to a validated or published disaster event",
			)
		) {
			statusHeader = 409;
		} else {
			statusHeader = 500;
		}
	}

	return Response.json(deleteRes, { status: statusHeader });
};
