import { MetaFunction, Outlet } from "react-router";

import { ViewContext } from "~/frontend/context";
import { parseOrganizationsQuery } from "~/frontend/organizationAction";
import { canAddNewRecord, roleHasPermission } from "~/frontend/user/roles";
import OrganizationManagementPage from "~/pages/OrganizationManagementPage";
import { OrganizationService } from "~/services/organizationService";
import { authLoaderWithPerm } from "~/utils/auth";
import { htmlTitle } from "~/utils/htmlmeta";
import {
	getCountryAccountsIdFromSession,
	getUserRoleFromSession,
} from "~/utils/session";

export { parseOrganizationsQuery };

export const meta: MetaFunction = ({ params }) => {
	const ctx = new ViewContext({ lang: params.lang || "en" });

	return [
		{
			title: htmlTitle(
				ctx,
				ctx.t({
					code: "organizations.title",
					msg: "Organizations",
				}),
			),
		},
		{
			name: "description",
			content: ctx.t({
				code: "organizations.subtitle",
				msg: "The organizations people on this site belong to.",
			}),
		},
	];
};

export const loader = authLoaderWithPerm(
	"ManageOrganizations",
	async (loaderArgs) => {
		const { request } = loaderArgs;
		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		const userRole = await getUserRoleFromSession(request);
		const { filters, data } =
			await OrganizationService.getOrganizationsPageData({
				request,
				countryAccountsId,
			});

		const canManage = roleHasPermission(
			userRole ?? null,
			"ManageOrganizations",
		);
		const canAdd = canManage && canAddNewRecord(userRole ?? null);

		return {
			filters,
			data,
			canManage,
			canAdd,
		};
	},
);

export default function OrganizationsLayoutPage() {
	return (
		<>
			<OrganizationManagementPage />
			<Outlet />
		</>
	);
}
