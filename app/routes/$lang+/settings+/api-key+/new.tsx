import { redirect } from "react-router";
import { BackendContext } from "~/backend.server/context";
import { ApiKeyRepository } from "~/db/queries/apiKeyRepository";
import {
	type ApiKeyActionResult,
	isFetcherRequest,
} from "~/frontend/apiKeyAction";
import {
	authActionGetAuth,
	authActionWithPerm,
	authLoaderWithPerm,
} from "~/utils/auth";
import {
	getCountryAccountsIdFromSession,
	redirectWithMessage,
} from "~/utils/session";

export const loader = authLoaderWithPerm("EditAPIKeys", async (args) => {
	const lang = args.params.lang || "en";
	return redirect(`/${lang}/settings/api-key/`);
});

export const action = authActionWithPerm("EditAPIKeys", async (actionArgs) => {
	const { request } = actionArgs;
	const backendCtx = new BackendContext(actionArgs);
	const auth = authActionGetAuth(actionArgs);
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const formData = await request.formData();
	const fetcher = isFetcherRequest(request, formData);
	const rawName = formData.get("name");
	const name = typeof rawName === "string" ? rawName.trim() : "";

	if (!name) {
		const msg = backendCtx.t({
			code: "api_keys.enter_name",
			msg: "Enter a name.",
		});
		if (fetcher) {
			return Response.json(
				{ ok: false, fieldErrors: { name: msg } } satisfies ApiKeyActionResult,
				{ status: 400 },
			);
		}
		return { ok: false, error: msg };
	}

	const exists = await ApiKeyRepository.existsByNameInTenant(
		countryAccountsId,
		name,
	);
	if (exists) {
		const msg = backendCtx.t({
			code: "api_keys.duplicate_name",
			msg: "A key with this name already exists.",
		});
		if (fetcher) {
			return Response.json(
				{ ok: false, fieldErrors: { name: msg } } satisfies ApiKeyActionResult,
				{ status: 409 },
			);
		}
		return { ok: false, error: msg };
	}

	const [created] = await ApiKeyRepository.create({
		name,
		managedByUserId: auth.user?.id,
		countryAccountsId,
	});

	if (fetcher) {
		return Response.json({
			ok: true,
			key: created,
		} satisfies ApiKeyActionResult);
	}

	return redirectWithMessage(actionArgs, "/settings/api-key", {
		type: "success",
		text: backendCtx.t({ code: "common.changes_saved", msg: "Changes saved" }),
	});
});

export default function ApiKeyNewRoute() {
	return null;
}
