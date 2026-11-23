import { describe, expect, it } from "vitest";
import {
	AuthorizationError,
	ConcurrentModificationError,
	ConflictError,
	NotFoundError,
	ValidationError,
} from "~/shared/errors";
import { OUTGOING_EVENT_RELATIONSHIP_CONFLICT } from "~/domains/hazardous-events/application/ports/IHazardousEventRepository";
import type { DeleteHazardousEventDependent } from "~/domains/hazardous-events/application/use-cases/DeleteHazardousEvent";
import { mapDeleteErrorToMessageKeys } from "./mapDeleteErrorToMessageKey";

function dependentsConflict(
	dependents: DeleteHazardousEventDependent[],
	message = "Cannot delete a hazardous event that has dependents",
): ConflictError {
	return new ConflictError(message, { hazardousEventId: "he-1", dependents });
}

describe("mapDeleteErrorToMessageKeys", () => {
	it.each([
		[{ type: "DISASTER_EVENT", count: 2 }, "delete.blocked.disaster_event"],
		[
			{ type: "EVENT_CAUSALITY", count: 1, crossTenantReferenceExists: false },
			"delete.blocked.event_causality",
		],
		[{ type: "CAUSAL_CHAIN", count: 3 }, "delete.blocked.causal_chain"],
	] as const)("maps a single %o dependent to %s", (dependent, key) => {
		expect(
			mapDeleteErrorToMessageKeys(dependentsConflict([dependent])),
		).toEqual([key]);
	});

	it("maps all three dependent types, in DISASTER_EVENT, EVENT_CAUSALITY, CAUSAL_CHAIN order", () => {
		expect(
			mapDeleteErrorToMessageKeys(
				dependentsConflict([
					{ type: "DISASTER_EVENT", count: 1 },
					{
						type: "EVENT_CAUSALITY",
						count: 1,
						crossTenantReferenceExists: true,
					},
					{ type: "CAUSAL_CHAIN", count: 1 },
				]),
			),
		).toEqual([
			"delete.blocked.disaster_event",
			"delete.blocked.event_causality",
			"delete.blocked.causal_chain",
		]);
	});

	it("keeps that canonical order even when the dependents arrive out of order", () => {
		expect(
			mapDeleteErrorToMessageKeys(
				dependentsConflict([
					{ type: "CAUSAL_CHAIN", count: 1 },
					{ type: "DISASTER_EVENT", count: 1 },
				]),
			),
		).toEqual(["delete.blocked.disaster_event", "delete.blocked.causal_chain"]);
	});

	it("maps a cross-tenant-only EVENT_CAUSALITY (count 0) to the key alone, carrying no count", () => {
		const result = mapDeleteErrorToMessageKeys(
			dependentsConflict([
				{ type: "EVENT_CAUSALITY", count: 0, crossTenantReferenceExists: true },
			]),
		);

		expect(result).toEqual(["delete.blocked.event_causality"]);
		expect(JSON.stringify(result)).not.toMatch(/\d/);
	});

	it("maps the dependent-less DEF-044 ConflictError to the caused-by key", () => {
		expect(
			mapDeleteErrorToMessageKeys(
				new ConflictError("Delete events that are caused by this event first", {
					id: "he-1",
					tenantId: "t-1",
					reason: OUTGOING_EVENT_RELATIONSHIP_CONFLICT,
				}),
			),
		).toEqual(["delete.blocked.caused_by"]);
	});

	it.each([
		["only an id", new ConflictError("x", { id: "he-1" })],
		[
			"the bare { id, tenantId } shape but no reason marker",
			new ConflictError("x", { id: "he-1", tenantId: "t-1" }),
		],
		[
			"a different reason marker",
			new ConflictError("x", { id: "he-1", tenantId: "t-1", reason: "OTHER" }),
		],
		[
			"the marker on a ConcurrentModificationError",
			new ConcurrentModificationError("x", {
				reason: OUTGOING_EVENT_RELATIONSHIP_CONFLICT,
			}),
		],
		["no context", new ConflictError("x")],
		[
			"a ConcurrentModificationError",
			new ConcurrentModificationError("x", { id: "he-1", tenantId: "t-1" }),
		],
		["an empty dependents array", dependentsConflict([])],
		[
			"only unknown dependent types",
			new ConflictError("x", { dependents: [{ type: "SOMETHING_NEW" }] }),
		],
	])(
		"maps a ConflictError with %s to the generic cannot-delete key, not caused-by",
		(_label, err) => {
			expect(mapDeleteErrorToMessageKeys(err)).toEqual([
				"delete.blocked.generic",
			]);
		},
	);

	it("maps AuthorizationError to the forbidden key", () => {
		expect(
			mapDeleteErrorToMessageKeys(
				new AuthorizationError("EditData permission required"),
			),
		).toEqual(["delete.forbidden"]);
	});

	it("maps NotFoundError to the not-found key", () => {
		expect(
			mapDeleteErrorToMessageKeys(new NotFoundError("HazardousEvent", "he-1")),
		).toEqual(["delete.not_found"]);
	});

	it.each([
		["ValidationError", new ValidationError("bad id")],
		["plain Error", new Error("boom")],
		["non-Error value", "boom"],
		["undefined", undefined],
	])("returns null for %s so the caller rethrows", (_label, err) => {
		expect(mapDeleteErrorToMessageKeys(err)).toBeNull();
	});

	it("never reads err.message: the same dependents map identically whatever the message says", () => {
		const dependents: DeleteHazardousEventDependent[] = [
			{ type: "DISASTER_EVENT", count: 1 },
		];
		expect(
			mapDeleteErrorToMessageKeys(
				dependentsConflict(
					dependents,
					"Delete events that are caused by this event first",
				),
			),
		).toEqual(["delete.blocked.disaster_event"]);

		const defConflict = new ConflictError("delete.blocked.disaster_event", {
			id: "he-1",
			tenantId: "t-1",
			reason: OUTGOING_EVENT_RELATIONSHIP_CONFLICT,
		});
		expect(mapDeleteErrorToMessageKeys(defConflict)).toEqual([
			"delete.blocked.caused_by",
		]);
	});

	it.each([
		[new NotFoundError("HazardousEvent", "he-1"), ["delete.not_found"]],
		[
			dependentsConflict([{ type: "CAUSAL_CHAIN", count: 1 }]),
			["delete.blocked.causal_chain"],
		],
		[
			new ConflictError("x", { reason: OUTGOING_EVENT_RELATIONSHIP_CONFLICT }),
			["delete.blocked.caused_by"],
		],
		[new ConflictError("x", { id: "he-1" }), ["delete.blocked.generic"]],
	])("never touches err.message (throwing getter) for %s", (err, expected) => {
		Object.defineProperty(err, "message", {
			get() {
				throw new Error("message must not be read");
			},
		});

		expect(mapDeleteErrorToMessageKeys(err)).toEqual(expected);
	});
});
