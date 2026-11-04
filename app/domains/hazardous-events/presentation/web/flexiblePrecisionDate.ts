export type DatePrecision = "yyyy-mm-dd" | "yyyy-mm" | "yyyy";

export interface FlexibleDateParts {
	y: number;
	m: number;
	d: number;
}

/** Presentation-local helpers for legacy's own date_optional_precision control
 * (input.tsx:223-449) -- length-based precision detection (10/7/4 chars), mirroring that
 * control exactly. `~/domains/shared/domain/flexibleDateFormat.ts` validates/normalizes the
 * same "YYYY"/"YYYY-MM"/"YYYY-MM-DD" convention (ADR-002) but has no parse/format pair of its
 * own -- these exist so the form never hand-rolls the regex logic a second time. */
export function parseFlexibleDateValue(value: string): {
	precision: DatePrecision;
	parts: FlexibleDateParts;
} {
	if (value.length === 10) {
		return {
			precision: "yyyy-mm-dd",
			parts: {
				y: Number(value.slice(0, 4)),
				m: Number(value.slice(5, 7)),
				d: Number(value.slice(8)),
			},
		};
	}
	if (value.length === 7) {
		return {
			precision: "yyyy-mm",
			parts: { y: Number(value.slice(0, 4)), m: Number(value.slice(5)), d: 1 },
		};
	}
	if (value.length === 4) {
		return { precision: "yyyy", parts: { y: Number(value), m: 1, d: 1 } };
	}
	return { precision: "yyyy-mm-dd", parts: { y: 0, m: 0, d: 0 } };
}

/** Empty string (not a malformed value) when a required part is missing -- same contract as
 * legacy's own `toDB()`, letting the hidden field submit blank until the active control is
 * actually complete. */
export function formatFlexibleDateValue(
	parts: FlexibleDateParts,
	precision: DatePrecision,
): string {
	if (precision === "yyyy") {
		return parts.y ? String(parts.y) : "";
	}
	if (precision === "yyyy-mm") {
		if (!parts.y || !parts.m) return "";
		return `${parts.y}-${String(parts.m).padStart(2, "0")}`;
	}
	if (!parts.y || !parts.m || !parts.d) return "";
	return `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
}
