import { describe, expect, it } from "vitest";
import { ConflictError, ValidationError } from "~/shared/errors";
import {
	extractCauseConflictError,
	extractFieldError,
} from "./extractFormFieldErrors";

describe("extractFieldError", () => {
	it("extracts the leading field name from a known-field message", () => {
		const err = new ValidationError("startDate must not be later than endDate");

		expect(extractFieldError(err)).toEqual({
			field: "startDate",
			message: "startDate must not be later than endDate",
		});
	});

	it("returns null when the leading word is not a known form field", () => {
		const err = new ValidationError("tenantId must not be empty");

		expect(extractFieldError(err)).toBeNull();
	});

	it("returns null for a message with no leading word match", () => {
		const err = new ValidationError("");

		expect(extractFieldError(err)).toBeNull();
	});

	// Every KNOWN_FIELDS entry exercised individually (test-quality-auditor finding) -- only
	// "startDate" was previously covered, so a typo'd field name here would have gone unnoticed.
	it.each([
		"specificHazardId",
		"endDate",
		"nationalSpecification",
		"description",
		"chainsExplanation",
		"magnitude",
		"recordOriginator",
		"dataSource",
		"hazardousEventStatus",
		"specificHazardLocalName",
		"specificHazardNationalName",
		"causeId",
	])("extracts %s as the leading field name", (field) => {
		const err = new ValidationError(`${field} must not be empty`);

		expect(extractFieldError(err)).toEqual({
			field,
			message: `${field} must not be empty`,
		});
	});

	it("returns null when a known field word appears but not at the message's start (test-quality-auditor finding -- proves the ^ anchor is load-bearing)", () => {
		const err = new ValidationError("The field startDate is required");

		expect(extractFieldError(err)).toBeNull();
	});
});

describe("extractCauseConflictError", () => {
	it("maps the self-cause ConflictError (causeId+effectId context) to causeId", () => {
		const err = new ConflictError(
			"A hazardous event cannot be its own cause and effect",
			{ causeId: "e1", effectId: "e1" },
		);

		expect(extractCauseConflictError(err)).toEqual({
			field: "causeId",
			message: "A hazardous event cannot be its own cause and effect",
		});
	});

	it("maps the cycle ConflictError (causeId+effectId context) to causeId", () => {
		const err = new ConflictError(
			"Linking this cause and effect would close a cycle in the causal chain",
			{ causeId: "e1", effectId: "e2" },
		);

		expect(extractCauseConflictError(err)).toEqual({
			field: "causeId",
			message:
				"Linking this cause and effect would close a cycle in the causal chain",
		});
	});

	it("maps the date-order ConflictError (causeStartDate+effectStartDate context) to causeId", () => {
		const err = new ConflictError(
			"The cause event must not start later than the effect event",
			{ causeStartDate: "2026-02-01", effectStartDate: "2026-01-01" },
		);

		expect(extractCauseConflictError(err)).toEqual({
			field: "causeId",
			message: "The cause event must not start later than the effect event",
		});
	});

	it("returns null for an unrelated ConflictError context shape (e.g. concurrency conflict)", () => {
		const err = new ConflictError(
			"HazardousEvent has been modified since it was read",
			{
				id: "e1",
			},
		);

		expect(extractCauseConflictError(err)).toBeNull();
	});

	it("returns null when context is undefined", () => {
		const err = new ConflictError("Some conflict with no context");

		expect(extractCauseConflictError(err)).toBeNull();
	});

	// Proves the && pairs, not ||, are load-bearing (test-quality-auditor finding) -- a context
	// with only one half of either pair must still fall through.
	it("returns null when context has only causeId, not effectId", () => {
		const err = new ConflictError("Unrelated conflict", { causeId: "e1" });

		expect(extractCauseConflictError(err)).toBeNull();
	});

	it("returns null when context has only causeStartDate, not effectStartDate", () => {
		const err = new ConflictError("Unrelated conflict", {
			causeStartDate: "2026-01-01",
		});

		expect(extractCauseConflictError(err)).toBeNull();
	});
});
