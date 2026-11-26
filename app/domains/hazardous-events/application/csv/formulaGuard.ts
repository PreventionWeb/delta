/** OWASP CSV Injection leading characters, including the full-width forms (design.md D8). */
const GUARDED_LEADING_CHARACTERS = "=+\\-@\\t\\r\\n＝＋－＠";

/** A guarded character, possibly behind quotes: guarding these keeps the strip an exact inverse. */
const NEEDS_GUARD = new RegExp(`^'*[${GUARDED_LEADING_CHARACTERS}]`);

/** A cell the guard produced: one or more `'` then a guarded character. The serializer quotes it. */
export const GUARDED_CELL_PATTERN = new RegExp(
	`^'+[${GUARDED_LEADING_CHARACTERS}]`,
);

/** Prefixes `'` so a spreadsheet treats the cell as text (OD-10). */
export function guardFormulaCell(value: string): string {
	return NEEDS_GUARD.test(value) ? `'${value}` : value;
}

/** Reverses `guardFormulaCell` on import (NOD-13); a cell that merely starts with `'` is kept. */
export function stripFormulaGuard(value: string): string {
	return GUARDED_CELL_PATTERN.test(value) ? value.slice(1) : value;
}
