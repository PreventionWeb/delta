import { handleFileRequest } from "~/components/ContentRepeater/FileViewer";
import { authLoaderPublicOrWithPerm } from "~/utils/auth";
import { TEMP_UPLOAD_PATH } from "~/utils/paths";
import { getCountryAccountsIdFromSession } from "~/utils/session";

export const loader = authLoaderPublicOrWithPerm(
	"ViewData",
	async ({ request, userSession }: any) => {
		const requestUrl = new URL(request.url);
		const download = requestUrl.searchParams.get("download") === "true";

		const directCountryAccountsId =
			await getCountryAccountsIdFromSession(request);

		const effectiveUserSession = {
			id: userSession?.id,
			countryAccountsId:
				userSession?.countryAccountsId || directCountryAccountsId,
			role: userSession?.role,
		};

		return await handleFileRequest(
			request,
			TEMP_UPLOAD_PATH,
			download,
			effectiveUserSession,
		);
	},
);
