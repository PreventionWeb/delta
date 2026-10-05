export function isValidFlexibleDateFormat(value: string): boolean {
	if (/^\d{4}$/.test(value)) {
		const year = Number(value);
		return year >= 1900 && year <= 2100;
	}
	if (/^\d{4}-\d{2}$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
		// Day-overflow values like "2026-02-30" pass, matching legacy.
		return !Number.isNaN(new Date(value).getTime());
	}
	return false;
}

/** Assumes isValidFlexibleDateFormat(value) is already true. */
export function normalizeFlexibleDateFloor(value: string): string {
	if (/^\d{4}$/.test(value)) return `${value}-01-01`;
	if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
	return value;
}

/** Assumes isValidFlexibleDateFormat(value) is already true. */
export function normalizeFlexibleDateCeiling(value: string): string {
	if (/^\d{4}$/.test(value)) return `${value}-12-31`;
	if (/^\d{4}-\d{2}$/.test(value)) {
		const year = parseInt(value.substring(0, 4), 10);
		const month = parseInt(value.substring(5, 7), 10);
		const lastDay = new Date(year, month, 0).getDate();
		return `${value}-${String(lastDay).padStart(2, "0")}`;
	}
	return value;
}
