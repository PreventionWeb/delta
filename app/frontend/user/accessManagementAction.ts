export type AccessManagementActionResult =
	| { ok: true; message?: string }
	| { ok: false; fieldErrors?: Record<string, string>; error?: string };

export function isFetcherRequest(
	request: Request,
	formData: FormData,
): boolean {
	const accept = request.headers.get("Accept") || "";
	return (
		formData.get("_fetcher") === "1" ||
		request.headers.get("X-Requested-With") === "fetcher" ||
		accept.includes("application/json")
	);
}
