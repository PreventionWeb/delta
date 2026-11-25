import { MetaFunction, Outlet } from "react-router";
import {
	type AccessManagementSortColumn,
	getUserCountryAccountsWithUserByCountryAccountsId,
	type SortDirection,
} from "~/db/queries/userCountryAccountsRepository";
import { OrganizationRepository } from "~/db/queries/organizationRepository";
import { authLoaderWithPerm } from "~/utils/auth";
import {
	getCountryAccountsIdFromSession,
	getUserRoleFromSession,
} from "~/utils/session";
import { ViewContext } from "~/frontend/context";
import { htmlTitle } from "~/utils/htmlmeta";
import AccessManagementPage from "~/pages/AccessManagementPage";

const VALID_SORT_COLUMNS = new Set<AccessManagementSortColumn>([
	"name",
	"status",
	"org",
	"role",
	"added",
]);

const VALID_PAGE_SIZES = new Set<number>([25, 50, 100]);

export function parseAccessManagementQuery(url: URL): {
	search: string;
	role: string;
	sort: AccessManagementSortColumn;
	dir: SortDirection;
	page: number;
	pageSize: number;
} {
	const search = url.searchParams.get("search") || "";
	const role = url.searchParams.get("role") || "all";

	const rawSort = url.searchParams.get("sort") || "added";
	const sort: AccessManagementSortColumn = VALID_SORT_COLUMNS.has(
		rawSort as AccessManagementSortColumn,
	)
		? (rawSort as AccessManagementSortColumn)
		: "added";

	const rawDir = url.searchParams.get("dir");
	const dir: SortDirection =
		rawDir === "asc" || rawDir === "desc" ? rawDir : "desc";

	const rawPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
	const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

	const rawPageSize = Number.parseInt(
		url.searchParams.get("pageSize") || "25",
		10,
	);
	const pageSize = VALID_PAGE_SIZES.has(rawPageSize) ? rawPageSize : 25;

	return { search, role, sort, dir, page, pageSize };
}

export const handle = { useDesignSystemCanvas: true };

export const meta: MetaFunction = ({ params }) => {
	const ctx = new ViewContext({ lang: params.lang || "en" });

	return [
		{
			title: htmlTitle(
				ctx,
				ctx.t({
					code: "meta.access_management",
					msg: "Access management",
				}),
			),
		},
		{
			name: "description",
			content: ctx.t({
				code: "meta.access_management",
				msg: "Access management",
			}),
		},
	];
};

export const loader = authLoaderWithPerm("ViewUsers", async (loaderArgs) => {
	const { request } = loaderArgs;
	const url = new URL(request.url);
	const query = parseAccessManagementQuery(url);

	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const organizations =
		await OrganizationRepository.getByCountryAccountsId(countryAccountsId);

	const items = await getUserCountryAccountsWithUserByCountryAccountsId(
		query.page,
		query.pageSize,
		countryAccountsId,
		{
			search: query.search || undefined,
			role: query.role !== "all" ? query.role : undefined,
			sort: query.sort,
			dir: query.dir,
		},
	);

	const userRole = await getUserRoleFromSession(request);

	return {
		...items,
		organizations,
		search: query.search,
		roleFilter: query.role,
		sort: query.sort,
		dir: query.dir,
		userRole,
	};
});

export default function AccessManagementLayout() {
	return (
		<>
			<AccessManagementPage />
			<Outlet />
		</>
	);
}
