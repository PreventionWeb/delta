import { assessmentTypeTable } from "~/drizzle/schema/assessmentTypeTable";
import { dr } from "~/db.server";
import { desc } from "drizzle-orm";
import { authLoaderApi } from "~/utils/auth";
import { paginationQueryFromURL } from "~/frontend/pagination/api.server";

export const loader = authLoaderApi(async ({ request }) => {
	const apiUrl = new URL(request.url);
	const pagination = paginationQueryFromURL(request, []);
	const totalItems = await dr.$count(assessmentTypeTable);
	const data = await dr.query.assessmentTypeTable.findMany({
		offset: pagination.query.skip,
		limit: pagination.query.take,
		orderBy: [desc(assessmentTypeTable.id)],
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
