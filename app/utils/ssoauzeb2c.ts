import { randomBytes, timingSafeEqual } from "crypto";
import { jwtDecode } from "jwt-decode";
import { redirect } from "react-router";

import { configSsoAzureB2C } from "~/utils/config";

export interface SSOAzureB2C {
	client_id: string;
	client_secret: string;
	login_userflow: string;
	login_redirect_url: string;
	login_redirect_url_admin: string;
	edit_userflow: string;
	edit_redirect_url: string;
	reset_userflow: string;
	reset_redirect_url: string;
	tenant: string;
}

export interface SsoOAuthSessionState {
	stateNonce: string;
	oidcNonce: string;
	action: "azure_sso_b2c-login" | "sso_azure_b2c-register";
	lang: string;
	isAdmin?: boolean;
	redirectTo?: string;
	inviteCode?: string;
	createdAt: number;
}

export const SSO_OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export function createSsoNonce(): string {
	return randomBytes(32).toString("hex");
}

export function verifySsoStateNonce(
	expected: string | undefined,
	received: string,
): boolean {
	if (!expected || !received) {
		return false;
	}
	const expectedBuf = Buffer.from(expected, "utf8");
	const receivedBuf = Buffer.from(received, "utf8");
	if (expectedBuf.length !== receivedBuf.length) {
		return false;
	}
	return timingSafeEqual(expectedBuf, receivedBuf);
}

export function getSafeSsoRedirectPath(
	redirectTo: string | null | undefined,
	fallback: string,
): string {
	if (
		redirectTo &&
		redirectTo.startsWith("/") &&
		!redirectTo.startsWith("//") &&
		!redirectTo.startsWith("/\\")
	) {
		return redirectTo;
	}
	return fallback;
}

type SSOAzureB2CErrorType = {
	error: string;
	error_description: string;
};

export interface SSOAzureB2CLoginError extends SSOAzureB2CErrorType {}

export function baseURL(): string {
	const jsonAzureB2C: SSOAzureB2C = configSsoAzureB2C();
	const baseURL = `https://${jsonAzureB2C.tenant}.b2clogin.com/${jsonAzureB2C.tenant}.onmicrosoft.com/oauth2/v2.0`;
	return baseURL;
}

/**
 * Redirects to the Azure B2C authorization endpoint with cryptographic state and nonce.
 */
export function loginGetCode(
	pState: string,
	pNonce?: string,
	headers?: HeadersInit,
) {
	const jsonAzureB2C: SSOAzureB2C = configSsoAzureB2C();
	const state = encodeURIComponent(pState);
	const nonce = encodeURIComponent(pNonce || createSsoNonce());
	let redirectURL = jsonAzureB2C.login_redirect_url.trim();
	let scope = "openid+email";
	redirectURL = encodeURIComponent(redirectURL);

	const url = `${baseURL()}/authorize?p=${jsonAzureB2C.login_userflow}&client_id=${jsonAzureB2C.client_id}&nonce=${nonce}&redirect_uri=${redirectURL}&scope=${scope}&response_type=code&prompt=login&state=${state}`;

	return redirect(url, { status: 302, headers });
}

export function loginGetCodeAdmin(
	pState?: string,
	pNonce?: string,
	headers?: HeadersInit,
) {
	const jsonAzureB2C: SSOAzureB2C = configSsoAzureB2C();
	let redirectURL = jsonAzureB2C.login_redirect_url_admin.trim();
	let scope = "openid+email";
	redirectURL = encodeURIComponent(redirectURL);
	const nonce = encodeURIComponent(pNonce || createSsoNonce());
	const stateParam = pState ? `&state=${encodeURIComponent(pState)}` : "";
	const url = `${baseURL()}/authorize?p=${jsonAzureB2C.login_userflow}&client_id=${jsonAzureB2C.client_id}&nonce=${nonce}&redirect_uri=${redirectURL}&scope=${scope}&response_type=code&prompt=login${stateParam}`;

	return redirect(url, { status: 302, headers });
}

export function decodeToken(pToken: string) {
	const decoded = jwtDecode(pToken);

	return decoded;
}

export function editProfile(pRedirectURL: string) {
	// const jsonAzureB2C:SSOAzureB2C = configSsoAzureB2C();
	// const userFlow = 'B2C_1_UN_UNDRR_PROFILE_EDITING';
	let redirectURL = pRedirectURL.trim();
	redirectURL = encodeURIComponent(redirectURL);
	// const url = `${baseURL()}/authorize?p=${userFlow}&client_id=${jsonAzureB2C.client_id}&nonce=defaultNonce&redirect_uri=${redirectURL}&scope=openid&response_type=code&prompt=none`;
}

export function passwordReset(pRedirectURL: string) {
	// const jsonAzureB2C:SSOAzureB2C = configSsoAzureB2C();
	// const userFlow = 'B2C_1_UN_UNDRR_PASSWORD_RESET';
	let redirectURL = pRedirectURL.trim();
	redirectURL = encodeURIComponent(redirectURL);
	// const url = `${baseURL()}/authorize?p=${userFlow}&client_id=${jsonAzureB2C.client_id}&nonce=defaultNonce&redirect_uri=${redirectURL}&scope=openid&response_type=code&prompt=none`;
}

/*
B2C_1_UN_UNDRR_PASSWORD_RESET
https://unb2c.b2clogin.com/unb2c.onmicrosoft.com/oauth2/v2.0/authorize?p=B2C_1_UN_UNDRR_PASSWORD_RESET&client_id=b12b15b7-889a-41c5-a0bf-50b8d31a68a2&nonce=defaultNonce&redirect_uri=https%3A%2F%2Fdrupal-testing.undrr.org%2Flogin%2Foauth2%2Fauthentication%2Funb2c%2Fcallback&scope=openid&response_type=code&prompt=login


B2C_1_UN_UNDRR_PROFILE_EDITING
https://unb2c.b2clogin.com/unb2c.onmicrosoft.com/oauth2/v2.0/authorize?p=B2C_1_UN_UNDRR_PASSWORD_RESET&client_id=b12b15b7-889a-41c5-a0bf-50b8d31a68a2&nonce=defaultNonce&redirect_uri=https%3A%2F%2Fdrupal-testing.undrr.org%2Flogin%2Foauth2%2Fauthentication%2Funb2c%2Fcallback&scope=openid&response_type=code&prompt=login


B2C_1_UN_UNDRR_SIGNUP_SIGNIN
https://unb2c.b2clogin.com/unb2c.onmicrosoft.com/oauth2/v2.0/authorize?p=B2C_1_UN_UNDRR_SIGNUP_SIGNIN&client_id=b12b15b7-889a-41c5-a0bf-50b8d31a68a2&nonce=defaultNonce&redirect_uri=https%3A%2F%2Fdrupal-testing.undrr.org%2Flogin%2Foauth2%2Fauthentication%2Funb2c%2Fcallback&scope=openid&response_type=code&prompt=login
/** */
