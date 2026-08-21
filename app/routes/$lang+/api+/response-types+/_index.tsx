import { responseTypeTable } from "~/drizzle/schema/responseTypeTable";
import { dr } from "~/db.server";
import { desc } from "drizzle-orm";
import { authLoaderApi } from "~/utils/auth";
import { paginationQueryFromURL } from "~/frontend/pagination/api.server";

export const loader = authLoaderApi(async ({ request }) => {
	const apiUrl = new URL(request.url);
	const pagination = paginationQueryFromURL(request, []);
	const totalItems = await dr.$count(responseTypeTable);
	const data = await dr.query.responseTypeTable.findMany({
		offset: pagination.query.skip,
		limit: pagination.query.take,
		orderBy: [desc(responseTypeTable.id)],
	});

	return Response.json({
		method: "GET",
		endpoint: `${apiUrl.origin}${apiUrl.pathname}`,
		example: `${apiUrl.origin}${apiUrl.pathname}?page=1&pageSize=100`,
		pagination: {
			totalItems,
			itemsOnThisPage: data.length,
			...pagination.viewData,
		},
		data,
	});
});
