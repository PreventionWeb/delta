import { type ActionFunctionArgs, redirect } from "react-router";
import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import {
	getCountryAccountsIdFromSession,
	getCountrySettingsFromSession,
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

export const action = authActionWithPerm(
	"EditUsers",
	async (actionArgs: ActionFunctionArgs) => {
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
					{
						ok: false,
						error: msg,
					} satisfies AccessManagementActionResult,
					{ status: 400 },
				);
			}
			return { errors: [msg] };
		}

		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		const countrySettings = await getCountrySettingsFromSession(request);

		try {
			await AccessManagementService.resendInvitation(ctx, {
				id,
				countryAccountsId,
				countrySettings,
			});
		} catch (err) {
			if (err instanceof AccessManagementServiceError) {
				const message = err.errors?.[0] || err.message;
				if (fetcher) {
					return Response.json(
						{
							ok: false,
							error: message,
						} satisfies AccessManagementActionResult,
						{ status: err.status },
					);
				}
				return { errors: [message] };
			}

			console.error("Resend invitation failed:", err);
			const unexpected = ctx.t({
				code: "common.unexpected_error",
				msg: "Unexpected error",
			});
			if (fetcher) {
				return Response.json(
					{
						ok: false,
						error: unexpected,
					} satisfies AccessManagementActionResult,
					{ status: 500 },
				);
			}
			return { errors: [unexpected] };
		}

		if (fetcher) {
			return Response.json({ ok: true } satisfies AccessManagementActionResult);
		}

		return redirectWithMessage(actionArgs, "/settings/access-mgmnt/", {
			type: "success",
			text: ctx.t({
				code: "admin.invitation_resent",
				msg: "Invitation email sent successfully",
			}),
		});
	},
);

export default function ResendInvitationRoute() {
	return null;
}
