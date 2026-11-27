import { and, eq } from "drizzle-orm";
import { dr } from "~/db.server";
import { authLoaderPublicOrWithPerm } from "~/utils/auth";
import { getCountryAccountsIdFromSession } from "~/utils/session";

export const loader = authLoaderPublicOrWithPerm(
	"ViewData",
	async ({ params, request }) => {
		const id = params.id;
		if (!id) {
			throw new Response("Missing ID", { status: 400 });
		}
		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		if (!countryAccountsId) {
			throw new Response("Unauthorized", { status: 401 });
		}
		const result = await dr.query.divisionTable.findFirst({
			where: (divisionTable) =>
				and(
					eq(divisionTable.id, id),
					eq(divisionTable.countryAccountsId, countryAccountsId),
				),
		});

		if (!result?.geojson) {
			throw new Response("GeoJSON not found", { status: 404 });
		}

		return Response.json({ geojson: result.geojson });
	},
);
