import { describe, it, expect } from "vitest";
import { UNSAFE_ErrorResponseImpl as ErrorResponseImpl } from "react-router";
import type { ErrorResponse } from "~/shared/errors/ErrorResponse";
import { mapRouteErrorToView } from "./mapRouteErrorToView";

function envelope(overrides: Partial<ErrorResponse["error"]> = {}) {
	return {
		success: false,
		error: {
			code: "NOT_FOUND",
			message: "HazardousEvent not found",
			traceId: "trace-123",
			timestamp: "2026-11-23T00:00:00.000Z",
			...overrides,
		},
	};
}

/** The shape React Router hands a boundary for a thrown Response. */
function routeError(status: number, data: unknown = envelope()) {
	return new ErrorResponseImpl(status, "", data);
}

describe("mapRouteErrorToView", () => {
	it.each([
		[404, "not_found"],
		[403, "forbidden"],
		[400, "invalid_request"],
		[422, "invalid_request"],
		[409, "conflict"],
		[500, "unexpected"],
		[401, "unexpected"],
		[418, "unexpected"],
	] as const)("maps status %i to kind %s", (status, kind) => {
		expect(mapRouteErrorToView(routeError(status)).kind).toBe(kind);
	});

	it("returns the envelope's traceId for a route error response", () => {
		expect(mapRouteErrorToView(routeError(404))).toEqual({
			kind: "not_found",
			traceId: "trace-123",
		});
	});

	it.each([
		["a plain Error", new Error("Failed query: select 1")],
		["a string", "boom"],
		["undefined", undefined],
		["null", null],
		["a Response-like object missing internal", { status: 404, data: {} }],
	])("maps %s to unexpected with no traceId", (_label, error) => {
		expect(mapRouteErrorToView(error)).toEqual({
			kind: "unexpected",
			traceId: null,
		});
	});

	it("gives no traceId when the envelope has none", () => {
		const data = { success: false, error: { code: "NOT_FOUND" } };
		expect(mapRouteErrorToView(routeError(404, data))).toEqual({
			kind: "not_found",
			traceId: null,
		});
	});

	it("gives no traceId for an empty-string traceId", () => {
		expect(
			mapRouteErrorToView(routeError(404, envelope({ traceId: "" }))).traceId,
		).toBeNull();
	});

	it("gives no traceId for a non-string traceId", () => {
		const data = { success: false, error: { traceId: 42 } };
		expect(mapRouteErrorToView(routeError(404, data)).traceId).toBeNull();
	});

	it.each([
		["a string body", "Not Found"],
		["a null body", null],
		["a body with no error object", { success: false }],
		["a body whose error is a string", { error: "oops" }],
	])("keeps the status kind and gives no traceId for %s", (_label, data) => {
		expect(mapRouteErrorToView(routeError(404, data))).toEqual({
			kind: "not_found",
			traceId: null,
		});
	});

	it("never carries message or details into the view", () => {
		const view = mapRouteErrorToView(
			routeError(
				422,
				envelope({
					code: "VALIDATION_ERROR",
					message: "SECRET-MESSAGE",
					details: { entity: "HazardousEvent", id: "SECRET-ID" },
				}),
			),
		);

		expect(Object.keys(view).sort()).toEqual(["kind", "traceId"]);
		expect(JSON.stringify(view)).not.toMatch(/SECRET|HazardousEvent/);
	});
});
