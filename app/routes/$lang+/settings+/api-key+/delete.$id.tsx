import { redirect } from "react-router";
import { BackendContext } from "~/backend.server/context";
import { ApiKeyRepository } from "~/db/queries/apiKeyRepository";
import {
	type ApiKeyActionResult,
	isFetcherRequest,
} from "~/frontend/apiKeyAction";
import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import {
	getCountryAccountsIdFromSession,
	redirectWithMessage,
} from "~/utils/session";

export const loader = authLoaderWithPerm("EditAPIKeys", async (loaderArgs) => {
	const { request, params } = loaderArgs;
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const selectedApiKey = params.id
		? ((await ApiKeyRepository.getById(params.id)) ?? null)
		: null;

	if (
		!selectedApiKey ||
		selectedApiKey.countryAccountsId !== countryAccountsId
	) {
		throw new Response("Not Found", { status: 404 });
	}

	const lang = params.lang || "en";
	return redirect(`/${lang}/settings/api-key/`);
});

export const action = authActionWithPerm("EditAPIKeys", async (actionArgs) => {
	const { request, params } = actionArgs;
	const backendCtx = new BackendContext(actionArgs);
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const formData = await request.formData();
	const fetcher = isFetcherRequest(request, formData);

	if (!params.id) {
		const msg = backendCtx.t({
			code: "common.missing_id",
			msg: "Missing ID",
		});
		if (fetcher) {
			return Response.json(
				{ ok: false, error: msg } satisfies ApiKeyActionResult,
				{ status: 400 },
			);
		}
		return { ok: false, error: msg };
	}

	const existing = await ApiKeyRepository.getById(params.id);
	if (!existing || existing.countryAccountsId !== countryAccountsId) {
		throw new Response("Not Found", { status: 404 });
	}

	await ApiKeyRepository.delete(params.id);

	if (fetcher) {
		return Response.json({ ok: true } satisfies ApiKeyActionResult);
	}

	return redirectWithMessage(actionArgs, "/settings/api-key", {
		type: "success",
		text: backendCtx.t({
			code: "common.record_deleted",
			msg: "Record deleted",
		}),
	});
});

export default function ApiKeyDeleteRoute() {
	return null;
}
