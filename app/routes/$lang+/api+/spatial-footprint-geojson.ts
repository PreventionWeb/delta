import type { LoaderFunctionArgs } from "react-router";
import { dr } from "~/db.server";
import { sql } from "drizzle-orm";
import { apiAuth } from "~/backend.server/models/api_key";
import { CountryAccountsRepository } from "~/db/queries/countryAccountsRepository";
import { countryAccountStatuses } from "~/drizzle/schema/countryAccountsTable";
import { disasterRecordsTable } from "~/drizzle/schema/disasterRecordsTable";
import { authLoaderPublicOrWithPerm } from "~/utils/auth";
import { getCountryAccountsIdFromSession } from "~/utils/session";

async function fetchSpatialFootprintGeojson(
	request: Request,
	countryAccountsId: string,
	requirePublished: boolean,
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

	const approvalPredicate = requirePublished
		? sql`AND ${disasterRecordsTable.approvalStatus} = 'published'`
		: sql``;

	const query = sql`
    SELECT value -> 'geojson' AS geojson
    FROM disaster_records,
         jsonb_array_elements(spatial_footprint) AS value
    WHERE disaster_records.id = ${record_id}
      AND disaster_records.country_accounts_id = ${countryAccountsId}
      ${approvalPredicate}
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
	async ({ request, userSession }: any) => {
		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		if (!countryAccountsId) {
			throw new Response("Unauthorized", { status: 401 });
		}
		const isPublicAccess = !userSession?.user;
		return fetchSpatialFootprintGeojson(
			request,
			countryAccountsId,
			isPublicAccess,
		);
	},
);

export const loader = async (args: LoaderFunctionArgs) => {
	const authToken = args.request.headers.get("X-Auth");
	if (authToken) {
		const apiKey = await apiAuth(args.request);
		if (!apiKey.countryAccountsId) {
			throw new Response("Unauthorized", { status: 401 });
		}
		const countryAccount = await CountryAccountsRepository.getById(
			apiKey.countryAccountsId,
		);
		if (
			!countryAccount ||
			countryAccount.status !== countryAccountStatuses.ACTIVE
		) {
			throw new Response("Forbidden", { status: 403 });
		}
		return fetchSpatialFootprintGeojson(
			args.request,
			apiKey.countryAccountsId,
			false,
		);
	}
	return sessionLoader(args);
};
