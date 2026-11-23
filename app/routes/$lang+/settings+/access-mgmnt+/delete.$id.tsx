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
	const { id } = params;
	const formData = await request.formData();
	const fetcher = isFetcherRequest(request, formData);

	if (!id) {
		const msg = ctx.t({
			code: "settings.access_mgmnt.missing_user_id",
			msg: "Missing user ID",
		});
		if (fetcher) {
			return Response.json(
				{ ok: false, error: msg } satisfies AccessManagementActionResult,
				{ status: 400 },
			);
		}
		throw new Response(msg, { status: 400 });
	}

	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) {
		const msg = ctx.t({
			code: "settings.access_mgmnt.unauthorized_no_tenant",
			msg: "Unauthorized - no tenant context",
		});
		if (fetcher) {
			return Response.json(
				{ ok: false, error: msg } satisfies AccessManagementActionResult,
				{ status: 401 },
			);
		}
		throw new Response(msg, { status: 401 });
	}

	try {
		await AccessManagementService.deleteUser({
			id,
			countryAccountsId,
		});

		if (fetcher) {
			return Response.json({ ok: true } satisfies AccessManagementActionResult);
		}

		return redirectWithMessage(actionArgs, "/settings/access-mgmnt/", {
			type: "info",
			text: ctx.t({
				code: "common.user_deleted_successfully",
				msg: "User deleted successfully.",
			}),
		});
	} catch (err) {
		if (err instanceof AccessManagementServiceError) {
			return Response.json(
				{
					ok: false,
					error: err.message,
				} satisfies AccessManagementActionResult,
				{ status: err.status },
			);
		}
		console.error("Delete user error:", err);
		return Response.json(
			{
				ok: false,
				error: ctx.t({
					code: "settings.access_mgmnt.delete_failed",
					msg: "Failed to delete user. Please try again.",
				}),
			} satisfies AccessManagementActionResult,
			{ status: 500 },
		);
	}
});

export default function DeleteUserRoute() {
	return null;
}
