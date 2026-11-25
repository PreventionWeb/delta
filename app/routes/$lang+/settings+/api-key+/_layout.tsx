import { MetaFunction, Outlet } from "react-router";
import {
	ApiKeyRepository,
	type ApiKeySortColumn,
	type ApiKeySortDirection,
} from "~/db/queries/apiKeyRepository";
import { ViewContext } from "~/frontend/context";
import { canAddNewRecord, canEditRecord } from "~/frontend/user/roles";
import ApiKeysPage from "~/pages/ApiKeysPage";
import { authLoaderWithPerm } from "~/utils/auth";
import { htmlTitle } from "~/utils/htmlmeta";
import {
	getCountryAccountsIdFromSession,
	getUserRoleFromSession,
} from "~/utils/session";

export const handle = { useDesignSystemCanvas: true };

const VALID_SORT_COLUMNS = new Set<ApiKeySortColumn>([
	"name",
	"managedBy",
	"created",
]);

const VALID_PAGE_SIZES = new Set<number>([25, 50, 100]);

export function parseApiKeysQuery(url: URL): {
	sort: ApiKeySortColumn;
	dir: ApiKeySortDirection;
	page: number;
	pageSize: number;
} {
	const rawSort = url.searchParams.get("sort") || "created";
	const sort: ApiKeySortColumn = VALID_SORT_COLUMNS.has(
		rawSort as ApiKeySortColumn,
	)
		? (rawSort as ApiKeySortColumn)
		: "created";

	const rawDir = url.searchParams.get("dir");
	const dir: ApiKeySortDirection =
		rawDir === "asc" || rawDir === "desc" ? rawDir : "desc";

	const rawPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
	const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

	const rawPageSize = Number.parseInt(
		url.searchParams.get("pageSize") || "25",
		10,
	);
	const pageSize = VALID_PAGE_SIZES.has(rawPageSize) ? rawPageSize : 25;

	return { sort, dir, page, pageSize };
}

export const meta: MetaFunction = ({ params }) => {
	const ctx = new ViewContext({ lang: params.lang || "en" });

	return [
		{
			title: htmlTitle(
				ctx,
				ctx.t({
					code: "api_keys.api_keys",
					msg: "API keys",
				}),
			),
		},
		{
			name: "description",
			content: ctx.t({
				code: "api_keys.subtitle",
				msg: "Keys that let other applications read and send data for this site.",
			}),
		},
	];
};

export const loader = authLoaderWithPerm("EditAPIKeys", async (loaderArgs) => {
	const { request } = loaderArgs;
	const url = new URL(request.url);
	const query = parseApiKeysQuery(url);
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const userRole = await getUserRoleFromSession(request);

	const result = await ApiKeyRepository.listByCountryAccountsId(
		countryAccountsId,
		query,
	);

	return {
		items: result.items,
		total: result.total,
		existingNames: result.existingNames,
		sort: query.sort,
		dir: query.dir,
		page: result.page,
		pageSize: query.pageSize,
		canAdd: canAddNewRecord(userRole ?? null),
		canEdit: canEditRecord(userRole ?? null),
	};
});

export default function ApiKeysLayout() {
	return (
		<>
			<ApiKeysPage />
			<Outlet />
		</>
	);
}
