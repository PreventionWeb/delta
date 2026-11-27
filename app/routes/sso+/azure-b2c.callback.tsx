import {
	createUserSession,
	sessionCookie,
	superAdminSessionCookie,
} from "~/utils/session";

import { configSsoAzureB2C } from "~/utils/config";

import {
	SSOAzureB2C as interfaceSSOAzureB2C,
	SSO_OAUTH_STATE_MAX_AGE_MS,
	baseURL,
	decodeToken,
	getSafeSsoRedirectPath,
	verifySsoStateNonce,
	type SsoOAuthSessionState,
} from "~/utils/ssoauzeb2c";
import { verifyAzureB2CIdToken } from "~/utils/ssoJwtVerify.server";
import {
	loginAzureB2C,
	registerAzureB2C,
	checkSuperAdminByEmail,
	loginSuperAdminAzureB2C,
} from "~/backend.server/models/user/auth";
import { validateInviteCode } from "~/backend.server/models/user/invite";
import { getAvailableLanguages } from "~/backend.server/translations";
import { UserCountryAccountRepository } from "~/db/queries/userCountryAccountsRepository";
import { InstanceSystemSettingRepository } from "~/db/queries/instanceSystemSettingRepository";

import { LoaderFunctionArgs, redirect } from "react-router";
import { proxiedFetch } from "~/utils/proxied-fetch";

interface interfaceAzureB2CData {
	email: string;
	firstName: string;
	lastName: string;
}

export type typeAzureB2CData =
	| {
			okay: true;
			email: string;
			firstName: string;
			lastName: string;
			errors: "";
	  }
	| {
			okay: false;
			email: string;
			firstName: string;
			lastName: string;
			errors: string;
	  };

async function _code2Token(
	paramCode: string,
	expectedNonce: string,
): Promise<typeAzureB2CData> {
	const jsonAzureB2C: interfaceSSOAzureB2C = configSsoAzureB2C();
	const urlSSOCode2Token = `${baseURL()}/token?p=${jsonAzureB2C.login_userflow}`;
	let data: interfaceAzureB2CData = {
		email: "",
		firstName: "",
		lastName: "",
	};

	try {
		const response = await proxiedFetch(urlSSOCode2Token, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				client_id: jsonAzureB2C.client_id,
				client_secret: jsonAzureB2C.client_secret,
				code: paramCode,
				grant_type: "authorization_code",
			}),
		});
		const result: any = await response.json();

		if ("id_token" in result && typeof result.id_token === "string") {
			const token = await verifyAzureB2CIdToken(
				result.id_token,
				expectedNonce,
			);

			// Special handling for Google IDP to extract email from nested claims
			if ("idp" in token && String(token.idp) === "google.com") {
				if ("family_name" in token && token.family_name) {
					data.lastName = String(token.family_name);
				}
				if ("given_name" in token && token.given_name) {
					data.firstName = String(token.given_name);
				}
				if ("emails" in token) {
					if (Array.isArray(token.emails) && token.emails.length > 0) {
						data.email = String(token.emails[0]);
					} else if (typeof token.emails === "string") {
						data.email = token.emails;
					}
				}
			} else if (
				"idp_access_token" in token &&
				typeof token.idp_access_token === "string"
			) {
				// Outer Azure B2C id_token signature & claims are verified above;
				// extract upstream UN Staff identity claims embedded by B2C.
				const tokenIdp = decodeToken(token.idp_access_token) as Record<
					string,
					unknown
				>;
				if ("family_name" in tokenIdp && tokenIdp.family_name) {
					data.lastName = String(tokenIdp.family_name);
				}
				if ("given_name" in tokenIdp && tokenIdp.given_name) {
					data.firstName = String(tokenIdp.given_name);
				}
				if ("unique_name" in tokenIdp && tokenIdp.unique_name) {
					data.email = String(tokenIdp.unique_name);
				}
			} else {
				if ("family_name" in token && token.family_name) {
					data.lastName = String(token.family_name);
				}
				if ("given_name" in token && token.given_name) {
					data.firstName = String(token.given_name);
				}
				if ("emails" in token) {
					if (Array.isArray(token.emails) && token.emails.length > 0) {
						data.email = String(token.emails[0]);
					} else if (typeof token.emails === "string") {
						data.email = token.emails;
					}
				}
			}

			if (!data.email) {
				return {
					okay: false,
					email: "",
					firstName: data.firstName,
					lastName: data.lastName,
					errors: "Verified ID token did not contain an email claim.",
				};
			}

			return {
				okay: true,
				email: data.email,
				firstName: data.firstName,
				lastName: data.lastName,
				errors: "",
			};
		} else if ("error" in result && "error_description" in result) {
			return {
				okay: false,
				email: data.email,
				firstName: data.firstName,
				lastName: data.lastName,
				errors: String(result.error_description),
			};
		}

		return {
			okay: false,
			email: "",
			firstName: "",
			lastName: "",
			errors: "Missing id_token in SSO token response.",
		};
	} catch (error) {
		return {
			okay: false,
			email: data.email,
			firstName: data.firstName,
			lastName: data.lastName,
			errors:
				error instanceof Error ? error.message : "SSO token verification failed.",
		};
	}
}

function getSafeLang(lang: string | undefined): string {
	if (lang && getAvailableLanguages().includes(lang)) {
		return lang;
	}
	return "en";
}

export const loader = async (loaderArgs: LoaderFunctionArgs) => {
	const { request } = loaderArgs;

	const url = new URL(request.url);
	const queryStringCode = url.searchParams.get("code") || "";
	const queryStringDesc = url.searchParams.get("error_description") || "";
	const queryStringState = url.searchParams.get("state") || "";

	if (queryStringDesc) {
		throw new Response(queryStringDesc, {
			status: 400,
			statusText: "Bad Request",
		});
	}

	const cookieHeader = request.headers.get("Cookie") || "";
	const session = await sessionCookie().getSession(cookieHeader);
	const storedOAuthState = session.get("ssoOAuthState") as
		| SsoOAuthSessionState
		| undefined;
	const sessionLoginOrigin = session.get("loginOrigin");

	// Always consume one-time OAuth state from the session to prevent replay.
	session.unset("ssoOAuthState");

	if (
		!storedOAuthState ||
		!verifySsoStateNonce(storedOAuthState.stateNonce, queryStringState) ||
		typeof storedOAuthState.createdAt !== "number" ||
		Date.now() - storedOAuthState.createdAt > SSO_OAUTH_STATE_MAX_AGE_MS ||
		!storedOAuthState.oidcNonce
	) {
		throw new Response("Invalid or expired SSO callback state.", {
			status: 400,
			statusText: "Bad Request",
		});
	}

	if (!queryStringCode) {
		throw new Response("Missing authorization code.", {
			status: 400,
			statusText: "Bad Request",
		});
	}

	const safeLang = getSafeLang(storedOAuthState.lang);

	if (storedOAuthState.action === "sso_azure_b2c-register") {
		const inviteCode = (storedOAuthState.inviteCode || "").trim();
		const inviteValidation = await validateInviteCode(inviteCode);
		if (!inviteValidation.ok) {
			throw new Response("Invalid or expired invitation.", {
				status: 400,
				statusText: "Bad Request",
			});
		}

		const data2 = await _code2Token(
			queryStringCode,
			storedOAuthState.oidcNonce,
		);
		if (!data2.okay) {
			throw new Response(data2.errors || "SSO token exchange failed.", {
				status: 400,
				statusText: "Bad Request",
			});
		}

		if (
			data2.email.toLowerCase() !== inviteValidation.email.toLowerCase()
		) {
			throw new Response(
				"Authenticated SSO email does not match the invitation email.",
				{ status: 403, statusText: "Forbidden" },
			);
		}

		const retLogin = await registerAzureB2C(
			data2.email,
			data2.firstName,
			data2.lastName,
		);
		if (!retLogin.ok) {
			throw new Response(retLogin.error || "Registration failed.", {
				status: 400,
				statusText: "Bad Request",
			});
		}

		const headers = await createUserSession(retLogin.userId);
		const userCountryAccounts = await UserCountryAccountRepository.getByUserId(
			retLogin.userId,
		);

		if (userCountryAccounts && userCountryAccounts.length === 1) {
			const countrySettings =
				await InstanceSystemSettingRepository.getByCountryAccountId(
					userCountryAccounts[0].countryAccountsId,
				);

			const userSession = await sessionCookie().getSession(
				headers["Set-Cookie"],
			);
			userSession.set(
				"countryAccountsId",
				userCountryAccounts[0].countryAccountsId,
			);
			userSession.set("countrySettings", countrySettings);
			const setCookie = await sessionCookie().commitSession(userSession);
			const lang = getSafeLang(countrySettings?.language);

			return redirect(`/${lang}/hazardous-event/`, {
				headers: { "Set-Cookie": setCookie },
			});
		}

		if (userCountryAccounts && userCountryAccounts.length > 1) {
			return redirect(`/${safeLang}/user/select-instance`, {
				headers: headers,
			});
		}

		throw new Response("No country account is associated with this user.", {
			status: 403,
			statusText: "Forbidden",
		});
	} else if (storedOAuthState.action === "azure_sso_b2c-login") {
		try {
			const data2 = await _code2Token(
				queryStringCode,
				storedOAuthState.oidcNonce,
			);

			if (!data2.okay) {
				throw new Response(data2.errors || "SSO token exchange failed.", {
					status: 400,
					statusText: "Bad Request",
				});
			}

			const superAdminCheck = await checkSuperAdminByEmail(data2.email);
			const isFromAdminLogin =
				Boolean(storedOAuthState.isAdmin) || sessionLoginOrigin === "admin";

			if (superAdminCheck.ok && isFromAdminLogin) {
				const superAdminLogin = await loginSuperAdminAzureB2C(
					data2.email,
					data2.firstName,
					data2.lastName,
				);

				if (!superAdminLogin.ok) {
					throw new Response("Super admin login failed.", {
						status: 403,
						statusText: "Forbidden",
					});
				}

				const saSession = await superAdminSessionCookie().getSession();
				saSession.set("superAdminId", superAdminLogin.superAdminId);
				const superAdminCookie =
					await superAdminSessionCookie().commitSession(saSession);

				const clearedUserCookie = await sessionCookie().commitSession(session);
				const safeRedirect = getSafeSsoRedirectPath(
					storedOAuthState.redirectTo,
					"/admin/country-accounts",
				);
				const targetPath = safeRedirect.startsWith(`/${safeLang}/`)
					? safeRedirect
					: `/${safeLang}${safeRedirect}`;

				const responseHeaders = new Headers();
				responseHeaders.append("Set-Cookie", superAdminCookie);
				responseHeaders.append("Set-Cookie", clearedUserCookie);

				return redirect(targetPath, { headers: responseHeaders });
			}

			if (isFromAdminLogin && !superAdminCheck.ok) {
				throw new Response(
					"This account is not authorized for Admin Management. Please sign in with a super admin account.",
					{ status: 403, statusText: "Forbidden" },
				);
			}

			const retLogin = await loginAzureB2C(
				data2.email,
				data2.firstName,
				data2.lastName,
			);

			if (!retLogin.ok) {
				throw new Response(retLogin.error || "User login failed.", {
					status: 401,
					statusText: "Unauthorized",
				});
			}

			if (retLogin.userId == "0") {
				throw new Response("System error.", {
					status: 500,
					statusText: "Internal Server Error",
				});
			}

			const headers = await createUserSession(retLogin.userId);
			const userCountryAccounts = await UserCountryAccountRepository.getByUserId(
				retLogin.userId,
			);

			if (userCountryAccounts && userCountryAccounts.length === 1) {
				const countrySettings =
					await InstanceSystemSettingRepository.getByCountryAccountId(
						userCountryAccounts[0].countryAccountsId,
					);

				const userSession = await sessionCookie().getSession(
					headers["Set-Cookie"],
				);
				userSession.set(
					"countryAccountsId",
					userCountryAccounts[0].countryAccountsId,
				);
				userSession.set("countrySettings", countrySettings);
				const setCookie = await sessionCookie().commitSession(userSession);
				const lang = getSafeLang(countrySettings?.language);

				return redirect(`/${lang}/hazardous-event/`, {
					headers: { "Set-Cookie": setCookie },
				});
			} else if (userCountryAccounts && userCountryAccounts.length > 1) {
				return redirect(`/${safeLang}/user/select-instance`, {
					headers: headers,
				});
			}

			throw new Response("No country account is associated with this user.", {
				status: 403,
				statusText: "Forbidden",
			});
		} catch (error) {
			if (error instanceof Response) {
				throw error;
			}
			console.error("Azure B2C callback error:", {
				code: queryStringCode ? "present" : "missing",
				errorType: error?.constructor?.name,
				message: error instanceof Error ? error.message : String(error),
			});
			throw new Response(
				"An error occurred during authentication. Please try again.",
				{ status: 500, statusText: "Internal Server Error" },
			);
		}
	}

	throw new Response("Invalid SSO callback request.", {
		status: 400,
		statusText: "Bad Request",
	});
};

export default function SsoAzureB2cCallback() {
	return null;
}
