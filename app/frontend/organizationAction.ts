export { isFetcherRequest } from "~/frontend/user/accessManagementAction";

export type OrganizationSortColumn = "name" | "users";
export type OrganizationSortDirection = "asc" | "desc";

export type OrganizationFetcherResult =
	| {
			ok: true;
			intent: "create" | "update" | "delete";
	  }
	| {
			ok: false;
			fieldErrors?: { name?: string };
			error?: string;
	  };

const VALID_SORT_COLUMNS = new Set<OrganizationSortColumn>(["name", "users"]);
const VALID_PAGE_SIZES = new Set<number>([25, 50, 100]);

export function parseOrganizationsQuery(url: URL): {
	search: string;
	sort: OrganizationSortColumn;
	dir: OrganizationSortDirection;
	page: number;
	pageSize: number;
} {
	const search = (url.searchParams.get("search") || "").trim();

	const rawSort = url.searchParams.get("sort") || "name";
	const sort: OrganizationSortColumn = VALID_SORT_COLUMNS.has(
		rawSort as OrganizationSortColumn,
	)
		? (rawSort as OrganizationSortColumn)
		: "name";

	const rawDir = url.searchParams.get("dir");
	const dir: OrganizationSortDirection =
		rawDir === "asc" || rawDir === "desc" ? rawDir : "asc";

	const rawPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
	const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

	const rawPageSize = Number.parseInt(
		url.searchParams.get("pageSize") || "25",
		10,
	);
	const pageSize = VALID_PAGE_SIZES.has(rawPageSize) ? rawPageSize : 25;

	return { search, sort, dir, page, pageSize };
}
