import { LoaderFunctionArgs, useLoaderData } from "react-router";
import { sessionCookie } from "~/utils/session";
import {
	createSsoNonce,
	getSafeSsoRedirectPath,
	loginGetCode,
	type SsoOAuthSessionState,
} from "~/utils/ssoauzeb2c";
import { getAvailableLanguages } from "~/backend.server/translations";
import { ViewContext } from "~/frontend/context";
import { LangLink } from "~/utils/link";
import { BackendContext } from "~/backend.server/context";

type LoaderData = { ok: false; errors: string } | { ok: true };

export const loader = async (
	loaderArgs: LoaderFunctionArgs,
): Promise<LoaderData | Response> => {
	const { request } = loaderArgs;
	const ctx = new BackendContext(loaderArgs);
	const url = new URL(request.url);
	const queryStringDesc = url.searchParams.get("error_description") || "";

	if (queryStringDesc) {
		return { ok: false, errors: queryStringDesc };
	}

	// Never exchange authorization codes on the initiation route without verified session state;
	// Azure B2C callbacks are handled exclusively by /sso/azure-b2c/callback.
	if (url.searchParams.get("code")) {
		return {
			ok: false,
			errors: "Invalid SSO callback endpoint. Please sign in again.",
		};
	}

	const origin = url.searchParams.get("origin") || "";
	const rawRedirectTo = url.searchParams.get("redirectTo") || "";
	const isAdmin = url.searchParams.get("isAdmin") === "true";
	const adminLogin = url.searchParams.get("adminLogin") === "1";

	const cookieHeader = request.headers.get("Cookie") || "";
	const session = await sessionCookie().getSession(cookieHeader);
	const loginOrigin = session.get("loginOrigin");

	const adminIntent =
		origin === "admin" || isAdmin || adminLogin || loginOrigin === "admin";

	const lang = getAvailableLanguages().includes(ctx.lang) ? ctx.lang : "en";
	const stateNonce = createSsoNonce();
	const oidcNonce = createSsoNonce();

	const safeAdminRedirect = getSafeSsoRedirectPath(
		rawRedirectTo,
		"/admin/country-accounts",
	);

	const oauthState: SsoOAuthSessionState = {
		stateNonce,
		oidcNonce,
		action: "azure_sso_b2c-login",
		lang,
		isAdmin: adminIntent,
		redirectTo: adminIntent ? safeAdminRedirect : undefined,
		createdAt: Date.now(),
	};

	session.set("ssoOAuthState", oauthState);
	const setCookie = await sessionCookie().commitSession(session);

	return loginGetCode(stateNonce, oidcNonce, { "Set-Cookie": setCookie });
};

export default function SsoAzureB2cCallback() {
	const loaderData = useLoaderData<typeof loader>();
	const ctx = new ViewContext();

	if (!loaderData.ok) {
		return (
			<>
				<div>
					<h1>Error: received server error response</h1>
					<p>{loaderData.errors}</p>
				</div>
				<div>
					<LangLink lang={ctx.lang} to="/setup/admin-account-sso">
						Setup using SSO
					</LangLink>
				</div>
			</>
		);
	}

	return (
		<div>
			<p></p>
		</div>
	);
}
