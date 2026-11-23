import { redirect } from "react-router";
import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import {
	getCountryAccountsIdFromSession,
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

export const loader = authLoaderWithPerm("EditUsers", async (args) => {
	const lang = args.params.lang || "en";
	return redirect(`/${lang}/settings/access-mgmnt/`);
});

export const action = authActionWithPerm("EditUsers", async (actionArgs) => {
	const ctx = new BackendContext(actionArgs);
	const { request, params } = actionArgs;
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const id = params.id;

	const formData = await request.formData();
	const fetcher = isFetcherRequest(request, formData);

	if (!id) {
		const msg = ctx.t({
			code: "settings.access_mgmnt.missing_user_id",
			msg: "Missing user ID",
		});
		if (fetcher) {
			return Response.json(
				{
					ok: false,
					error: msg,
				} satisfies AccessManagementActionResult,
				{ status: 400 },
			);
		}
		throw new Response(msg, { status: 400 });
	}

	let organization = formData.get("organization") as string | null;
	const role = (formData.get("role") as string) || "";

	organization =
		organization && organization.trim() !== "" ? organization : null;

	try {
		await AccessManagementService.updateUser({
			id,
			countryAccountsId,
			role,
			organization,
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
		type: "success",
		text: ctx.t({
			code: "common.changes_saved",
			msg: "Changes saved",
		}),
	});
});

export default function EditUserRoute() {
	return null;
}
