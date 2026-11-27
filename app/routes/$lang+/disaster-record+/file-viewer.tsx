import { handleFileRequest } from "~/components/ContentRepeater/FileViewer";
import { authLoaderPublicOrWithPerm } from "~/utils/auth";
import { DISASTER_RECORDS_UPLOAD_PATH } from "~/utils/paths";
import { getCountryAccountsIdFromSession } from "~/utils/session";

const ALLOWED_LOCS = new Set(["disruptions", "losses", "damages", "record"]);

export const loader = authLoaderPublicOrWithPerm(
	"ViewData",
	async ({ request, userSession }: any) => {
		const url = new URL(request.url);
		const loc = url.searchParams.get("loc");
		const download = url.searchParams.get("download") === "true";

		if (!loc || !ALLOWED_LOCS.has(loc)) {
			return new Response("Invalid loc parameter", { status: 400 });
		}

		const directCountryAccountsId =
			await getCountryAccountsIdFromSession(request);

		const effectiveUserSession = {
			id: userSession?.id,
			countryAccountsId:
				userSession?.countryAccountsId || directCountryAccountsId,
			role: userSession?.role,
		};

		const uploadPath =
			loc === "record"
				? DISASTER_RECORDS_UPLOAD_PATH
				: `${DISASTER_RECORDS_UPLOAD_PATH}/${loc}`;

		return await handleFileRequest(
			request,
			uploadPath,
			download,
			effectiveUserSession,
		);
	},
);
