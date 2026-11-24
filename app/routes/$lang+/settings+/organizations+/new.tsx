import { redirect } from "react-router";

import { BackendContext } from "~/backend.server/context";
import {
	isFetcherRequest,
	type OrganizationFetcherResult,
} from "~/frontend/organizationAction";
import { OrganizationService } from "~/services/organizationService";
import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import {
	getCountryAccountsIdFromSession,
	redirectWithMessage,
} from "~/utils/session";

export const loader = authLoaderWithPerm(
	"ManageOrganizations",
	async (args) => {
		const lang = args.params.lang || "en";
		return redirect(`/${lang}/settings/organizations/`);
	},
);

export const action = authActionWithPerm(
	"ManageOrganizations",
	async (args) => {
		const { request } = args;
		const formData = await request.formData();
		const fetcher = isFetcherRequest(request, formData);
		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		const backendCtx = new BackendContext(args);

		formData.set("intent", "create");

		const result = await OrganizationService.organizationAction({
			backendCtx,
			countryAccountsId,
			formData,
		});

		if (fetcher) {
			if (result.ok) {
				return Response.json(result satisfies OrganizationFetcherResult);
			}
			return Response.json(result satisfies OrganizationFetcherResult, {
				status: 400,
			});
		}

		if (result.ok) {
			return redirectWithMessage(args, "/settings/organizations", {
				type: "success",
				text: backendCtx.t({
					code: "organization_added",
					msg: "Organization added",
				}),
			});
		}

		return result;
	},
);

export default function OrganizationsNewRoute() {
	return null;
}
