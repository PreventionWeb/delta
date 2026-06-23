import { eq } from "drizzle-orm";
import { buildTree } from "~/components/TreeView";
import { dr } from "~/db.server";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { authLoaderWithPerm } from "~/utils/auth";
import { getCountryAccountsIdFromSession } from "~/utils/session";

export const loader = authLoaderWithPerm("ViewData", async ({ request }) => {
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const rawData = await dr
		.select({
			id: divisionTable.id,
			parentId: divisionTable.parentId,
			name: divisionTable.name,
			importId: divisionTable.importId,
			nationalId: divisionTable.nationalId,
			level: divisionTable.level,
		})
		.from(divisionTable)
		.where(eq(divisionTable.countryAccountsId, countryAccountsId));

	const treeData = buildTree(rawData, "id", "parentId", "name", "en", [
		"importId",
		"nationalId",
		"level",
		"name",
	]);

	return Response.json(treeData);
});
