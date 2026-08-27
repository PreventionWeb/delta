import { ActionFunctionArgs } from "react-router";
import { apiAuth } from "~/backend.server/models/api_key";
import { authLoaderApi } from "~/utils/auth";

import { deleteAll } from "~/backend.server/models/division";
import { AppError, formatErrorForClient } from "~/utils/errors";

function hasForeignKeyConstraintError(error: unknown): boolean {
	const maybeError = error as any;
	return (
		maybeError?.code === "23503" ||
		maybeError?.details?.cause?.code === "23503" ||
		maybeError?.details?.cause?.cause?.code === "23503"
	);
}

export const loader = authLoaderApi(async () => {
	return Response.json("Use POST");
});

export const action = async (args: ActionFunctionArgs) => {
	const { request } = args;
	if (request.method !== "POST") {
		throw new Response("Method Not Allowed: Only POST requests are supported", {
			status: 405,
		});
	}
	const apiKey = await apiAuth(request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	try {
		const result = await deleteAll(countryAccountsId);
		return Response.json({ ok: true, ...result });
	} catch (error) {
		if (hasForeignKeyConstraintError(error)) {
			return Response.json(
				{
					ok: false,
					error: {
						code: "DIVISION_DELETE_BLOCKED_BY_RELATIONS",
						message:
							"You cannot delete all geographic divisions yet because some records still use them. Please remove or update all geographic-level links first, then try again.",
					},
				},
				{ status: 409 },
			);
		}

		const formatted = formatErrorForClient(error);
		const status = error instanceof AppError ? 400 : 500;
		return Response.json({ ok: false, error: formatted }, { status });
	}
};
