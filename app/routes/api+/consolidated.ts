import { LoaderFunctionArgs } from "react-router";

import { handleConsolidatedRequest } from "~/backend.server/handlers/sfm/consolidated_api.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	return handleConsolidatedRequest(request);
};
