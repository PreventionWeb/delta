import { describe, it, expect, vi, afterEach } from "vitest";
import {
	AuthorizationError,
	ConcurrentModificationError,
	ConflictError,
	NotFoundError,
	ValidationError,
	toErrorResponseDetails,
} from "~/shared/errors";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("toErrorResponseDetails", () => {
	it("returns { field } for a ValidationError with a string field", () => {
		expect(
			toErrorResponseDetails(new ValidationError("bad", { field: "page" })),
		).toEqual({ field: "page" });
	});

	it("drops every other context key on a ValidationError", () => {
		const details = toErrorResponseDetails(
			new ValidationError("bad", {
				field: "page",
				tenantId: "t-1",
				sql: "select 1",
			}),
		);

		expect(details).toEqual({ field: "page" });
		expect(Object.keys(details ?? {})).toEqual(["field"]);
	});

	it.each([
		["a number", 42],
		["null", null],
		["an object", { name: "page" }],
		["undefined", undefined],
	])("returns undefined when field is %s", (_label, field) => {
		expect(
			toErrorResponseDetails(new ValidationError("bad", { field })),
		).toBeUndefined();
	});

	it("returns undefined for a ValidationError with no context", () => {
		expect(toErrorResponseDetails(new ValidationError("bad"))).toBeUndefined();
	});

	it("returns undefined for a ValidationError whose context has no field", () => {
		expect(
			toErrorResponseDetails(new ValidationError("bad", { tenantId: "t-1" })),
		).toBeUndefined();
	});

	it.each([
		["NotFoundError", new NotFoundError("HazardousEvent", "he-1")],
		["AuthorizationError", new AuthorizationError("no", { field: "page" })],
		["ConflictError", new ConflictError("x", { field: "page", id: "he-1" })],
		[
			"ConcurrentModificationError",
			new ConcurrentModificationError("x", { field: "page", id: "he-1" }),
		],
	])(
		"returns undefined for %s, even with a field in context",
		(_label, err) => {
			expect(toErrorResponseDetails(err)).toBeUndefined();
		},
	);

	it("logs nothing about the dropped context", () => {
		const spies = (["log", "info", "warn", "error", "debug"] as const).map(
			(method) => vi.spyOn(console, method).mockImplementation(() => undefined),
		);

		toErrorResponseDetails(
			new ConflictError("x", { id: "he-1", tenantId: "t-1" }),
		);
		toErrorResponseDetails(
			new ValidationError("bad", { field: "page", tenantId: "t-1" }),
		);

		for (const spy of spies) {
			expect(spy).not.toHaveBeenCalled();
		}
	});
});
