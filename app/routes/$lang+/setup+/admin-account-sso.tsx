import type { LoaderFunctionArgs } from "react-router";
import { configAuthSupportedAzureSSOB2C } from "~/utils/config";
import { redirectLangFromRoute } from "~/utils/url.backend";

export const action = async () => {
	return null;
};

export const loader = async (loaderArgs: LoaderFunctionArgs) => {
	const allowedAzureSSOB2C: boolean = configAuthSupportedAzureSSOB2C();

	if (allowedAzureSSOB2C) {
		return redirectLangFromRoute(
			loaderArgs,
			"/sso/azure-b2c/login?isAdmin=true",
		);
	} else {
		throw new Error("Azure SSO B2C not allowed in the system.");
	}
};
