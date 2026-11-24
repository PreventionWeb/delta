import { describe, it, expect } from "vitest";
import { isWellFormedUuid } from "./isWellFormedUuid";

describe("isWellFormedUuid", () => {
	it.each([
		"3f2b6c1e-8a4d-4e2f-9b1c-0d5e7a9c2b4f",
		"3F2B6C1E-8A4D-4E2F-9B1C-0D5E7A9C2B4F",
		"00000000-0000-0000-0000-000000000000",
	])("accepts %s", (value) => {
		expect(isWellFormedUuid(value)).toBe(true);
	});

	it.each([
		"",
		"not-a-uuid",
		"3f2b6c1e8a4d4e2f9b1c0d5e7a9c2b4f",
		"{3f2b6c1e-8a4d-4e2f-9b1c-0d5e7a9c2b4f}",
		"3f2b6c1e-8a4d-4e2f-9b1c-0d5e7a9c2b4",
		"3f2b6c1e-8a4d-4e2f-9b1c-0d5e7a9c2b4ff",
		"x3f2b6c1e-8a4d-4e2f-9b1c-0d5e7a9c2b4f",
		"3f2b6c1e-8a4d-4e2f-9b1c-0d5e7a9c2b4fx",
		"3f2b6c1g-8a4d-4e2f-9b1c-0d5e7a9c2b4f",
		"3f2b6c1e-8a4d-4e2f-9b1c-0d5e7a9c2b4f\n",
	])("rejects %j", (value) => {
		expect(isWellFormedUuid(value)).toBe(false);
	});
});
