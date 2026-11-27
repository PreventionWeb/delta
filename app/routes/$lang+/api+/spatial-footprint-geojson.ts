import type { LoaderFunctionArgs } from "react-router";
import { dr } from "~/db.server";
import { sql } from "drizzle-orm";
import { apiAuth } from "~/backend.server/models/api_key";
import { authLoaderPublicOrWithPerm } from "~/utils/auth";
import { getCountryAccountsIdFromSession } from "~/utils/session";

async function fetchSpatialFootprintGeojson(
	request: Request,
	countryAccountsId: string,
): Promise<Response> {
	const url = new URL(request.url);
	const division_id = url.searchParams.get("division_id");
	const record_id = url.searchParams.get("record_id");

	if (!division_id || !record_id) {
		return new Response(JSON.stringify({ error: "Missing parameters" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const query = sql`
    SELECT value -> 'geojson' AS geojson
    FROM disaster_records,
         jsonb_array_elements(spatial_footprint) AS value
    WHERE disaster_records.id = ${record_id}
      AND disaster_records.country_accounts_id = ${countryAccountsId}
      AND value -> 'geojson' -> 'properties' ->> 'division_id' = ${division_id}
    LIMIT 1
  `;

	const result = await dr.execute(query);
	const raw = result?.rows?.[0]?.geojson;
	const geojson = typeof raw === "string" ? JSON.parse(raw) : raw;

	if (!geojson || !geojson.geometry) {
		return new Response(
			JSON.stringify({ error: "No matching geojson found" }),
			{
				status: 404,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	return new Response(JSON.stringify(geojson), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

const sessionLoader = authLoaderPublicOrWithPerm(
	"ViewData",
	async ({ request }) => {
		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		if (!countryAccountsId) {
			throw new Response("Unauthorized", { status: 401 });
		}
		return fetchSpatialFootprintGeojson(request, countryAccountsId);
	},
);

export const loader = async (args: LoaderFunctionArgs) => {
	const authToken = args.request.headers.get("X-Auth");
	if (authToken) {
		const apiKey = await apiAuth(args.request);
		if (!apiKey.countryAccountsId) {
			throw new Response("Unauthorized", { status: 401 });
		}
		return fetchSpatialFootprintGeojson(
			args.request,
			apiKey.countryAccountsId,
		);
	}
	return sessionLoader(args);
};
