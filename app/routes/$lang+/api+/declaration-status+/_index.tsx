import { authLoaderApiDocs } from "~/utils/auth";
import { BackendContext } from "~/backend.server/context";

export const loader = authLoaderApiDocs(async (requestArgs) => {
	const ctx = new BackendContext(requestArgs);

	const docs = `
GET ${ctx.fullUrl("/api/declaration-statuses")}

Authentication:
Header: X-Auth: <your_api_key>

Returns the available declaration statuses.
`;

	return new Response(docs, {
		status: 200,
		headers: { "Content-Type": "text/plain" },
	});
});
