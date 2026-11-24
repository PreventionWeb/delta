// Same shape as the list filters' UUID_RE (parseHazardousEventListFilters.ts).
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hyphenated 8-4-4-4-12 hex, any case; anything else can match no `uuid` row. */
export function isWellFormedUuid(value: string): boolean {
	return UUID_RE.test(value);
}
