import { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { validateInviteCode } from "~/backend.server/models/user/invite";
import { getAvailableLanguages } from "~/backend.server/translations";
import { sessionCookie } from "~/utils/session";
import {
	createSsoNonce,
	loginGetCode,
	type SsoOAuthSessionState,
} from "~/utils/ssoauzeb2c";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const url = new URL(request.url);
	const inviteCode = (url.searchParams.get("inviteCode") || "").trim();
	const res = await validateInviteCode(inviteCode);

	if (res.ok && res.userId !== "0") {
		const stateNonce = createSsoNonce();
		const oidcNonce = createSsoNonce();
		const requestedLang = params.lang || "en";
		const lang = getAvailableLanguages().includes(requestedLang)
			? requestedLang
			: "en";

		const cookieHeader = request.headers.get("Cookie") || "";
		const session = await sessionCookie().getSession(cookieHeader);
		const oauthState: SsoOAuthSessionState = {
			stateNonce,
			oidcNonce,
			action: "sso_azure_b2c-register",
			lang,
			inviteCode,
			createdAt: Date.now(),
		};
		session.set("ssoOAuthState", oauthState);
		const setCookie = await sessionCookie().commitSession(session);

		return loginGetCode(stateNonce, oidcNonce, { "Set-Cookie": setCookie });
	}

	return { errors: "Invalid or expired invitation." };
};

export default function SsoAzureB2cCallback() {
	const loaderData = useLoaderData<typeof loader>();

	if (loaderData?.errors) {
		return (
			<>
				<div>
					<h1>Error: received server error response</h1>
					<p>{loaderData.errors}</p>
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
