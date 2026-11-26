import { describe, expect, it } from "vitest";
import { ConflictError } from "~/shared/errors";
import { causalConflictKind } from "./causalConflictKind";

describe("causalConflictKind", () => {
	it("returns null when the error has no context", () => {
		expect(causalConflictKind(new ConflictError("x"))).toBeNull();
	});

	it("returns null for an empty context", () => {
		expect(causalConflictKind(new ConflictError("x", {}))).toBeNull();
	});

	it("returns cause_after_effect when both start dates are present", () => {
		const err = new ConflictError("x", {
			causeStartDate: "2025-02-01",
			effectStartDate: "2025-01-01",
		});
		expect(causalConflictKind(err)).toBe("cause_after_effect");
	});

	it("returns cycle when both ids are present", () => {
		const err = new ConflictError("x", { causeId: "a", effectId: "b" });
		expect(causalConflictKind(err)).toBe("cycle");
	});

	it("prefers cause_after_effect when both shapes are present", () => {
		const err = new ConflictError("x", {
			causeId: "a",
			effectId: "b",
			causeStartDate: "2025-02-01",
			effectStartDate: "2025-01-01",
		});
		expect(causalConflictKind(err)).toBe("cause_after_effect");
	});

	it("classifies by key presence even when values are undefined", () => {
		const err = new ConflictError("x", {
			causeId: undefined,
			effectId: undefined,
		});
		expect(causalConflictKind(err)).toBe("cycle");
	});

	it("returns null when only causeStartDate is present", () => {
		const err = new ConflictError("x", { causeStartDate: "2025-01-01" });
		expect(causalConflictKind(err)).toBeNull();
	});

	it("returns null when only effectStartDate is present", () => {
		const err = new ConflictError("x", { effectStartDate: "2025-01-01" });
		expect(causalConflictKind(err)).toBeNull();
	});

	it("returns null when only causeId is present", () => {
		const err = new ConflictError("x", { causeId: "a" });
		expect(causalConflictKind(err)).toBeNull();
	});

	it("returns null when only effectId is present", () => {
		const err = new ConflictError("x", { effectId: "b" });
		expect(causalConflictKind(err)).toBeNull();
	});

	it("returns null for a non-causal reason context", () => {
		const err = new ConflictError("x", { reason: "API_IMPORT_ID_TAKEN" });
		expect(causalConflictKind(err)).toBeNull();
	});

	it("returns null for one id and one date", () => {
		const err = new ConflictError("x", {
			causeId: "a",
			effectStartDate: "2025-01-01",
		});
		expect(causalConflictKind(err)).toBeNull();
	});
});
