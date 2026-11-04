/** Takes `URLSearchParams`, not `URL`, so the loader and list page can share one implementation. */
export function parsePagination(searchParams: URLSearchParams): {
	page: number;
	pageSize: number;
} {
	// 50 matches legacy's own pagination/api.server.ts DEFAULT_PAGE_SIZE.
	const DEFAULT_PAGE_SIZE = 50;
	const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
	const pageSize = Math.min(
		100,
		Math.max(
			1,
			parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) ||
				DEFAULT_PAGE_SIZE,
		),
	);
	return { page, pageSize };
}
