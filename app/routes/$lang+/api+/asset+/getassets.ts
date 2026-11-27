import { BackendContext } from "~/backend.server/context";
import { searchAssets } from "~/backend.server/models/asset";
import { authLoaderWithPerm } from "~/utils/auth";
import { getCountryAccountsIdFromSession } from "~/utils/session";

export const loader = authLoaderWithPerm("ViewData", async (args) => {
	const ctx = new BackendContext(args);
	const { request } = args;
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}
	const url = new URL(request.url);
	const query = url.searchParams.get("q") ?? "";

	const assets = await searchAssets(ctx, query, countryAccountsId);

	return Response.json(assets);
});
