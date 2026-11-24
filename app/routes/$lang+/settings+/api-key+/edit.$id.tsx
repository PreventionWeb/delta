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

export const loader = authLoaderWithPerm("EditAPIKeys", async (args) => {
	const { request, params } = args;
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const item = params.id ? await ApiKeyRepository.getById(params.id) : null;

	if (!item || item.countryAccountsId !== countryAccountsId) {
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

	const duplicate = await ApiKeyRepository.existsByNameInTenant(
		countryAccountsId,
		name,
		params.id,
	);
	if (duplicate) {
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

	await ApiKeyRepository.update(params.id, name);

	if (fetcher) {
		return Response.json({ ok: true } satisfies ApiKeyActionResult);
	}

	return redirectWithMessage(actionArgs, "/settings/api-key", {
		type: "success",
		text: backendCtx.t({ code: "common.changes_saved", msg: "Changes saved" }),
	});
});

export default function ApiKeyEditRoute() {
	return null;
}
