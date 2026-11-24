import { redirect } from "react-router";

import { BackendContext } from "~/backend.server/context";
import { OrganizationRepository } from "~/db/queries/organizationRepository";
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
	async (loaderArgs) => {
		const { request, params } = loaderArgs;
		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		const selectedOrganization = params.id
			? ((await OrganizationRepository.getById(params.id)) ?? null)
			: null;

		if (
			!selectedOrganization ||
			selectedOrganization.countryAccountsId !== countryAccountsId
		) {
			throw new Response("Not Found", { status: 404 });
		}

		const lang = params.lang || "en";
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

		formData.set("intent", "update");
		if (args.params.id) {
			formData.set("id", args.params.id);
		}

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
					code: "common.changes_saved",
					msg: "Changes saved",
				}),
			});
		}

		return result;
	},
);

export default function OrganizationsEditRoute() {
	return null;
}
