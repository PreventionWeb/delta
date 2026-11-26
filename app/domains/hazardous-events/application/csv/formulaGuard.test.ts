import { describe, expect, it } from "vitest";
import { guardFormulaCell, stripFormulaGuard } from "./formulaGuard";

// OWASP CSV Injection leading characters, including full-width forms.
const GUARDED = ["=", "+", "-", "@", "\t", "\r", "\n", "＝", "＋", "－", "＠"];

const SAFE = [
	"",
	"abc",
	"5",
	"2025-01-01",
	" =leading space",
	"a=b",
	"'quoted",
	"Météo-France",
];

describe("guardFormulaCell", () => {
	it.each(GUARDED)("prefixes ' when the cell starts with %j", (char) => {
		expect(guardFormulaCell(`${char}x`)).toBe(`'${char}x`);
	});

	it.each(GUARDED)("prefixes ' for the single character %j", (char) => {
		expect(guardFormulaCell(char)).toBe(`'${char}`);
	});

	it("neutralises a HYPERLINK formula", () => {
		expect(guardFormulaCell('=HYPERLINK("http://example.invalid")')).toBe(
			`'=HYPERLINK("http://example.invalid")`,
		);
	});

	it("prefixes a negative-looking number", () => {
		expect(guardFormulaCell("-5")).toBe("'-5");
	});

	it.each(SAFE)("leaves %j unchanged", (value) => {
		expect(guardFormulaCell(value)).toBe(value);
	});
});

describe("stripFormulaGuard (NOD-13)", () => {
	it.each(GUARDED)("removes one leading ' before %j", (char) => {
		expect(stripFormulaGuard(`'${char}x`)).toBe(`${char}x`);
	});

	it("strips one ' from a quote run before a guarded character (review m1)", () => {
		expect(stripFormulaGuard("''=x")).toBe("'=x");
	});

	it.each(["'abc", "'", "'5", "''", "' =x"])(
		"keeps %j, whose remainder is not guarded",
		(value) => {
			expect(stripFormulaGuard(value)).toBe(value);
		},
	);

	it.each(SAFE.filter((v) => !v.startsWith("'")))(
		"leaves the unprefixed cell %j unchanged",
		(value) => {
			expect(stripFormulaGuard(value)).toBe(value);
		},
	);

	it.each([...GUARDED.map((c) => `${c}x`), ...GUARDED, ...SAFE])(
		"round-trips %j through guard then strip",
		(value) => {
			expect(stripFormulaGuard(guardFormulaCell(value))).toBe(value);
		},
	);
});

describe("guard and strip are exact inverses (review m1)", () => {
	it.each(["'=x", "'+1", "''=x", "'@a"])(
		"strip(guard(%j)) returns the stored value",
		(value) => {
			expect(stripFormulaGuard(guardFormulaCell(value))).toBe(value);
		},
	);
});
