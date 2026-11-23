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
		// authLoaderPublicOrWithPerm already redirected away if this were null -- re-deriving it
		// here, not a new auth requirement (design.md Decision 9).
		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		if (!countryAccountsId) {
			throw new Response("GeoJSON not found", { status: 404 });
		}
		const result = await dr.query.divisionTable.findFirst({
			where: (divisionTable, { eq, and }) =>
				and(
					eq(divisionTable.id, id),
					eq(divisionTable.countryAccountsId, countryAccountsId),
				),
		});

		if (!result?.geojson) {
			throw new Response("GeoJSON not found", { status: 404 });
		}

		// Additive (ca-he-spatial-footprint-picker): the picker's own division-preview chip needs
		// a display name, reusing this fetch instead of a second /api/division/tree round-trip.
		const name = result.name.en ?? Object.values(result.name)[0] ?? "";

		return Response.json({ geojson: result.geojson, name });
	},
);
