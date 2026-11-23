import { redirect } from "react-router";
import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import {
	getCountryAccountsIdFromSession,
	getCountrySettingsFromSession,
	getUserFromSession,
	redirectWithMessage,
} from "~/utils/session";
import { BackendContext } from "~/backend.server/context";
import {
	AccessManagementService,
	AccessManagementServiceError,
} from "~/services/accessManagementService";
import {
	type AccessManagementActionResult,
	isFetcherRequest,
} from "~/frontend/user/accessManagementAction";

export const loader = authLoaderWithPerm("InviteUsers", async (args) => {
	const lang = args.params.lang || "en";
	return redirect(`/${lang}/settings/access-mgmnt/`);
});

export const action = authActionWithPerm("InviteUsers", async (actionArgs) => {
	const { request } = actionArgs;
	const loggedInUser = await getUserFromSession(request);
	const formData = await request.formData();
	const fetcher = isFetcherRequest(request, formData);
	const email = (formData.get("email") as string) || "";
	let organization = formData.get("organization") as string | null;
	const role = (formData.get("role") as string) || "";

	organization =
		organization && organization.trim() !== "" ? organization : null;

	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const ctx = new BackendContext(actionArgs);
	const countrySettings = await getCountrySettingsFromSession(request);

	try {
		await AccessManagementService.inviteUser(ctx, {
			email,
			organization,
			role,
			countryAccountsId,
			countrySettings,
			loggedInUserEmail: loggedInUser?.user.email,
		});
	} catch (error) {
		if (error instanceof AccessManagementServiceError) {
			if (fetcher) {
				const payload: AccessManagementActionResult = error.fieldErrors
					? { ok: false, fieldErrors: error.fieldErrors }
					: { ok: false, error: error.errors?.[0] || error.message };
				return Response.json(payload, { status: error.status });
			}
			if (error.fieldErrors) {
				return { ok: false, errors: error.fieldErrors };
			}
			throw new Response(error.message, { status: error.status });
		}
		throw error;
	}

	if (fetcher) {
		return Response.json({ ok: true } satisfies AccessManagementActionResult);
	}

	return redirectWithMessage(actionArgs, "/settings/access-mgmnt/", {
		type: "info",
		text: ctx.t({
			code: "settings.access_mgmnt.user_added_successfully",
			msg: "User has been successfully added!",
		}),
	});
});

export default function InviteUserRoute() {
	return null;
}
