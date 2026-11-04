import { redirect } from "react-router";
import { getRequestContext } from "~/utils/requestContext.server";
import { getCountryAccountsIdFromSession } from "~/utils/session";
import { getLanguageAllowDefault } from "~/utils/lang.backend";

export async function resolveTenantId(
	request: Request,
	lang: string,
): Promise<string> {
	const tenantId =
		getRequestContext()?.tenantId ??
		(await getCountryAccountsIdFromSession(request));
	if (!tenantId) {
		// Validate lang before building the redirect target -- an unvalidated route param can
		// turn this into a scheme-relative URL (open redirect).
		const safeLang = getLanguageAllowDefault({ params: { lang } });
		throw redirect(`/${safeLang}/user/select-instance`);
	}
	return tenantId;
}
