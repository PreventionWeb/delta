import { describe, expect, it } from "vitest";
import { ValidationError } from "~/shared/errors";
import { assertNonEmptyString } from "./assertNonEmptyString";

describe("assertNonEmptyString", () => {
	it("does not throw for a non-empty string", () => {
		expect(() => assertNonEmptyString("tenant-1", "tenantId")).not.toThrow();
	});

	it("throws ValidationError with a message naming the field for an empty string", () => {
		expect(() => assertNonEmptyString("", "tenantId")).toThrow(
			new ValidationError("tenantId must not be empty"),
		);
	});

	it("throws ValidationError for a whitespace-only string", () => {
		expect(() => assertNonEmptyString("   ", "tenantId")).toThrow(
			new ValidationError("tenantId must not be empty"),
		);
	});

	it("throws ValidationError for a non-string value", () => {
		expect(() => assertNonEmptyString(12345, "tenantId")).toThrow(
			new ValidationError("tenantId must not be empty"),
		);
	});

	it("throws ValidationError for null", () => {
		expect(() => assertNonEmptyString(null, "hazardousEventId")).toThrow(
			new ValidationError("hazardousEventId must not be empty"),
		);
	});

	it("throws ValidationError for undefined", () => {
		expect(() => assertNonEmptyString(undefined, "hazardousEventId")).toThrow(
			new ValidationError("hazardousEventId must not be empty"),
		);
	});
});
