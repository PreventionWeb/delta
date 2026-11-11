import { describe, expect, it } from "vitest";
import { ValidationError } from "~/shared/errors";
import { sanitizeBasename } from "./sanitizeBasename";

describe("sanitizeBasename", () => {
	it("returns the final segment of a forward-slash path", () => {
		expect(sanitizeBasename("uploads/tenant-1/temp/report.pdf")).toBe(
			"report.pdf",
		);
	});

	it("returns the final segment of a backslash path", () => {
		expect(sanitizeBasename("uploads\\tenant-1\\temp\\report.pdf")).toBe(
			"report.pdf",
		);
	});

	it("returns a bare basename unchanged", () => {
		expect(sanitizeBasename("report.pdf")).toBe("report.pdf");
	});

	it("strips a traversal prefix down to the safe final segment, rather than rejecting it", () => {
		expect(sanitizeBasename("../../other-tenant/secret.pdf")).toBe(
			"secret.pdf",
		);
	});

	it.each(["..", ".", ""])("throws ValidationError for %j", (input) => {
		expect(() => sanitizeBasename(input)).toThrow(ValidationError);
	});

	it("throws ValidationError for a name containing a NUL byte", () => {
		expect(() => sanitizeBasename("report\0.pdf")).toThrow(ValidationError);
	});

	it.each(["NUL", "nul", "CON", "con.txt", "COM1", "LPT9.pdf"])(
		"throws ValidationError for the Windows reserved device name %j",
		(input) => {
			expect(() => sanitizeBasename(input)).toThrow(ValidationError);
		},
	);

	it.each(["NULL.txt", "CONSOLE.txt", "COM10.txt"])(
		"does not reject %j, which only superficially resembles a reserved name",
		(input) => {
			expect(sanitizeBasename(input)).toBe(input);
		},
	);
});
