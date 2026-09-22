import { describe, expect, it } from "vitest";
import { ConflictError, ValidationError } from "~/shared/errors";
import {
	SpatialObservation,
	type SpatialObservationProps,
} from "./SpatialObservation";

const baseProps: SpatialObservationProps = {
	id: "spatial-observation-1",
	hazardousEventId: "hazardous-event-1",
	observationTime: new Date("2026-01-01T00:00:00Z"),
	note: null,
	geometries: [],
	divisionIds: [],
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-01T00:00:00Z"),
};
const emptyValidDivisionIds: ReadonlySet<string> = new Set();

function makeObservation(
	overrides: Partial<SpatialObservationProps> = {},
	validDivisionIds: ReadonlySet<string> = emptyValidDivisionIds,
): SpatialObservation {
	return SpatialObservation.create(
		{ ...baseProps, ...overrides },
		validDivisionIds,
	);
}

describe("SpatialObservation.create()", () => {
	describe("Requirement: validates required identity and time fields (spec Req 1)", () => {
		it("returns a SpatialObservation whose getters reflect the given props", () => {
			const props: SpatialObservationProps = {
				...baseProps,
				note: null,
				geometries: [],
				divisionIds: [],
			};

			const instance = SpatialObservation.create(props, emptyValidDivisionIds);

			expect(instance).toBeInstanceOf(SpatialObservation);
			expect(instance.id).toBe(props.id);
			expect(instance.hazardousEventId).toBe(props.hazardousEventId);
			expect(instance.observationTime).toEqual(props.observationTime);
			expect(instance.note).toBeNull();
			expect(instance.geometries).toEqual([]);
			expect(instance.divisionIds).toEqual([]);
			expect(instance.createdAt).toEqual(props.createdAt);
			expect(instance.updatedAt).toEqual(props.updatedAt);
		});

		it("throws ValidationError when hazardousEventId is an empty or whitespace-only string", () => {
			expect(() => makeObservation({ hazardousEventId: "" })).toThrow(
				ValidationError,
			);
			expect(() => makeObservation({ hazardousEventId: "" })).toThrow(
				/hazardousEventId/,
			);
			expect(() => makeObservation({ hazardousEventId: "   " })).toThrow(
				ValidationError,
			);
		});

		it("throws ValidationError, not a TypeError, when hazardousEventId is null, undefined, or non-string", () => {
			for (const bad of [null, undefined, 12345]) {
				const props = {
					...baseProps,
					hazardousEventId: bad,
				} as unknown as SpatialObservationProps;

				expect(() =>
					SpatialObservation.create(props, emptyValidDivisionIds),
				).toThrow(ValidationError);
				expect(() =>
					SpatialObservation.create(props, emptyValidDivisionIds),
				).toThrow(/hazardousEventId/);
			}
		});

		it("throws ValidationError when id is an empty or whitespace-only string", () => {
			expect(() => makeObservation({ id: "" })).toThrow(ValidationError);
			expect(() => makeObservation({ id: "" })).toThrow(/\bid\b/);
			expect(() => makeObservation({ id: "   " })).toThrow(ValidationError);
		});

		it("throws ValidationError, not a TypeError, when id is null, undefined, or non-string", () => {
			for (const bad of [null, undefined, 12345]) {
				const props = {
					...baseProps,
					id: bad,
				} as unknown as SpatialObservationProps;

				expect(() =>
					SpatialObservation.create(props, emptyValidDivisionIds),
				).toThrow(ValidationError);
				expect(() =>
					SpatialObservation.create(props, emptyValidDivisionIds),
				).toThrow(/\bid\b/);
			}
		});

		it("throws ValidationError naming observationTime, not a raw TypeError, when observationTime is a non-Date value", () => {
			for (const bad of ["2026-01-01", undefined, null, 12345]) {
				const props = {
					...baseProps,
					observationTime: bad,
				} as unknown as SpatialObservationProps;

				expect(() =>
					SpatialObservation.create(props, emptyValidDivisionIds),
				).toThrow(ValidationError);
				expect(() =>
					SpatialObservation.create(props, emptyValidDivisionIds),
				).toThrow(/observationTime/);
			}
		});

		it("throws ValidationError naming observationTime when observationTime is a syntactically-real but invalid Date (NaN time)", () => {
			expect(() =>
				makeObservation({ observationTime: new Date("not-a-real-date") }),
			).toThrow(ValidationError);
			expect(() =>
				makeObservation({ observationTime: new Date("not-a-real-date") }),
			).toThrow(/observationTime/);
		});

		it("throws ValidationError naming createdAt, not a raw TypeError, when createdAt is a non-Date value", () => {
			for (const bad of ["2026-01-01", undefined, null, 12345]) {
				const props = {
					...baseProps,
					createdAt: bad,
				} as unknown as SpatialObservationProps;

				expect(() =>
					SpatialObservation.create(props, emptyValidDivisionIds),
				).toThrow(ValidationError);
				expect(() =>
					SpatialObservation.create(props, emptyValidDivisionIds),
				).toThrow(/createdAt/);
			}
		});

		it("throws ValidationError naming createdAt when createdAt is a syntactically-real but invalid Date (NaN time)", () => {
			expect(() => makeObservation({ createdAt: new Date("garbage") })).toThrow(
				ValidationError,
			);
			expect(() => makeObservation({ createdAt: new Date("garbage") })).toThrow(
				/createdAt/,
			);
		});

		it("throws ValidationError naming updatedAt, not a raw TypeError, when updatedAt is a non-Date value", () => {
			for (const bad of ["2026-01-01", undefined, null, 12345]) {
				const props = {
					...baseProps,
					updatedAt: bad,
				} as unknown as SpatialObservationProps;

				expect(() =>
					SpatialObservation.create(props, emptyValidDivisionIds),
				).toThrow(ValidationError);
				expect(() =>
					SpatialObservation.create(props, emptyValidDivisionIds),
				).toThrow(/updatedAt/);
			}
		});

		it("throws ValidationError naming updatedAt when updatedAt is a syntactically-real but invalid Date (NaN time)", () => {
			expect(() => makeObservation({ updatedAt: new Date("garbage") })).toThrow(
				ValidationError,
			);
			expect(() => makeObservation({ updatedAt: new Date("garbage") })).toThrow(
				/updatedAt/,
			);
		});

		it("does not treat a null note as invalid input", () => {
			expect(() => makeObservation({ note: null })).not.toThrow();
		});

		it("preserves a non-null note value unchanged", () => {
			const instance = makeObservation({ note: "field team report" });

			expect(instance.note).toBe("field team report");
		});
	});

	describe("Check ordering (design.md Decisions 2/8 — Date and array-shape guards run before the id/hazardousEventId string loop)", () => {
		it("reports the observationTime error, not the createdAt error, when both are invalid", () => {
			const props = {
				...baseProps,
				observationTime: "not-a-date",
				createdAt: "also-not-a-date",
			} as unknown as SpatialObservationProps;

			expect(() =>
				SpatialObservation.create(props, emptyValidDivisionIds),
			).toThrow(/observationTime/);
		});

		it("reports the createdAt error, not a missing-id error, when both are invalid", () => {
			const props = {
				...baseProps,
				id: "",
				createdAt: "not-a-date",
			} as unknown as SpatialObservationProps;

			expect(() =>
				SpatialObservation.create(props, emptyValidDivisionIds),
			).toThrow(/createdAt/);
		});

		it("reports the divisionIds array-shape error, not a missing-id error, when both are invalid", () => {
			const props = {
				...baseProps,
				id: "",
				divisionIds: "div-1",
			} as unknown as SpatialObservationProps;

			expect(() =>
				SpatialObservation.create(props, emptyValidDivisionIds),
			).toThrow(/divisionIds must be an array/);
		});
	});

	describe("Requirement: validates that geometries and divisionIds are arrays before any array-element check (spec Req 2, design.md Decision 8)", () => {
		it("throws ValidationError naming geometries, not a raw error, when geometries is null or undefined", () => {
			for (const bad of [null, undefined]) {
				const props = {
					...baseProps,
					geometries: bad,
				} as unknown as SpatialObservationProps;

				expect(() =>
					SpatialObservation.create(props, emptyValidDivisionIds),
				).toThrow(ValidationError);
				expect(() =>
					SpatialObservation.create(props, emptyValidDivisionIds),
				).toThrow(/geometries/);
			}
		});

		it("throws ValidationError naming geometries, not silently spreading its characters, when geometries is a bare string", () => {
			const props = {
				...baseProps,
				geometries: "somestring",
			} as unknown as SpatialObservationProps;

			expect(() =>
				SpatialObservation.create(props, emptyValidDivisionIds),
			).toThrow(ValidationError);
			expect(() =>
				SpatialObservation.create(props, emptyValidDivisionIds),
			).toThrow(/geometries/);
		});

		it("throws ValidationError naming divisionIds, not a raw error, when divisionIds is null, undefined, or a non-array/non-string value", () => {
			for (const bad of [null, undefined, 12345]) {
				const props = {
					...baseProps,
					divisionIds: bad,
				} as unknown as SpatialObservationProps;

				expect(() =>
					SpatialObservation.create(props, emptyValidDivisionIds),
				).toThrow(ValidationError);
				expect(() =>
					SpatialObservation.create(props, emptyValidDivisionIds),
				).toThrow(/divisionIds/);
			}
		});

		it("throws ValidationError naming divisionIds, not silently spreading its characters, when divisionIds is a bare string", () => {
			const props = {
				...baseProps,
				divisionIds: "div-1",
			} as unknown as SpatialObservationProps;

			expect(() =>
				SpatialObservation.create(props, emptyValidDivisionIds),
			).toThrow(ValidationError);
			expect(() =>
				SpatialObservation.create(props, emptyValidDivisionIds),
			).toThrow(/divisionIds/);
		});

		it("evaluates the divisionIds array-shape check before the duplicate-value check", () => {
			// "aab" isn't an array, but if iterated as one, new Set("aab").size (2) !== "aab".length (3) would also trigger the
			// duplicate-value check -- proving the array-shape check runs first (design.md Decision 8).
			const props = {
				...baseProps,
				divisionIds: "aab",
			} as unknown as SpatialObservationProps;

			expect(() =>
				SpatialObservation.create(props, emptyValidDivisionIds),
			).toThrow(/divisionIds must be an array/);
		});
	});

	describe("Requirement: rejects duplicate divisionIds within one observation (spec Req 3)", () => {
		it("throws ValidationError when divisionIds contains a repeated value", () => {
			expect(() =>
				makeObservation(
					{ divisionIds: ["div-1", "div-2", "div-1"] },
					new Set(["div-1", "div-2"]),
				),
			).toThrow(ValidationError);
			expect(() =>
				makeObservation(
					{ divisionIds: ["div-1", "div-2", "div-1"] },
					new Set(["div-1", "div-2"]),
				),
			).toThrow(/duplicate/);
		});

		it("returns a SpatialObservation without error when divisionIds has no repeats", () => {
			const instance = makeObservation(
				{ divisionIds: ["div-1", "div-2"] },
				new Set(["div-1", "div-2"]),
			);

			expect(instance.divisionIds).toEqual(["div-1", "div-2"]);
		});

		it("checks the duplicate-divisionIds rule before the tenant-membership check (design.md Decision 3)", () => {
			// Both div-x entries are also absent from validDivisionIds; if membership ran first the error would name "div-x"
			// instead of reporting the generic duplicate-values message.
			expect(() =>
				makeObservation({ divisionIds: ["div-x", "div-x"] }, new Set()),
			).toThrow(/duplicate/);
		});
	});

	describe("Requirement: validates every divisionId against a caller-supplied tenant-scoped set (spec Req 4)", () => {
		it("throws ValidationError naming the offending divisionId when it is absent from validDivisionIds", () => {
			expect(() =>
				makeObservation({ divisionIds: ["div-1"] }, new Set(["div-2"])),
			).toThrow(ValidationError);
			expect(() =>
				makeObservation({ divisionIds: ["div-1"] }, new Set(["div-2"])),
			).toThrow(/div-1/);
		});

		it("returns a SpatialObservation without error when the divisionId is present in validDivisionIds", () => {
			const instance = makeObservation(
				{ divisionIds: ["div-1"] },
				new Set(["div-1"]),
			);

			expect(instance.divisionIds).toEqual(["div-1"]);
		});

		it("requires no membership check when divisionIds is empty, regardless of validDivisionIds", () => {
			expect(() =>
				makeObservation({ divisionIds: [] }, new Set()),
			).not.toThrow();
		});

		// Compile-time companion (design.md Decision 4): validDivisionIds is mandatory, no default — this must fail to compile,
		// proving a caller cannot skip the tenant-scoping argument.
		function _assertValidDivisionIdsIsMandatory(): void {
			// @ts-expect-error -- create() requires a second `validDivisionIds` argument.
			SpatialObservation.create(baseProps);
		}
		void _assertValidDivisionIdsIsMandatory;
	});

	describe("Immutability", () => {
		type MutableSpatialObservationProps = {
			-readonly [K in keyof SpatialObservationProps]: SpatialObservationProps[K];
		};

		it("does not reflect a later mutation of the input props object", () => {
			const props: MutableSpatialObservationProps = {
				...baseProps,
				note: "original",
			};
			const instance = SpatialObservation.create(props, emptyValidDivisionIds);

			props.note = "mutated after create()";

			expect(instance.note).toBe("original");
		});

		it("does not reflect a later mutation of the input geometries/divisionIds arrays", () => {
			const geometries: unknown[] = [{ type: "Point" }];
			const divisionIds: string[] = ["div-1"];
			const instance = SpatialObservation.create(
				{ ...baseProps, geometries, divisionIds },
				new Set(["div-1"]),
			);

			geometries.push({ type: "Polygon" });
			divisionIds.push("div-2");

			expect(instance.geometries).toEqual([{ type: "Point" }]);
			expect(instance.divisionIds).toEqual(["div-1"]);
		});

		it("does not reflect a later mutation of an array returned by the geometries/divisionIds getters", () => {
			const instance = makeObservation(
				{ geometries: [{ type: "Point" }], divisionIds: ["div-1"] },
				new Set(["div-1"]),
			);

			const returnedGeometries = instance.geometries as unknown[];
			const returnedDivisionIds = instance.divisionIds as string[];
			returnedGeometries.push({ type: "Polygon" });
			returnedDivisionIds.push("div-2");

			expect(instance.geometries).toEqual([{ type: "Point" }]);
			expect(instance.divisionIds).toEqual(["div-1"]);
		});

		it("produces independent instances when two entities are built from the same base props with different overrides", () => {
			const first = makeObservation({ note: "first" });
			const second = makeObservation({ note: "second" });

			expect(first.note).toBe("first");
			expect(second.note).toBe("second");
			expect(first).not.toBe(second);
		});

		// Compile-time companion: fails to compile if `id` is ever widened to mutable.
		function _assertPropsFieldIsReadonly(props: SpatialObservationProps): void {
			// @ts-expect-error -- id is declared readonly; direct reassignment must not compile.
			props.id = "reassigned";
		}
		void _assertPropsFieldIsReadonly;
	});

	describe("Date getters return a clone, not the live internal instance", () => {
		it("mutating a returned observationTime Date does not affect the entity's own state", () => {
			const instance = makeObservation();

			instance.observationTime.setFullYear(1900);

			expect(instance.observationTime.getFullYear()).not.toBe(1900);
			expect(instance.observationTime).toEqual(baseProps.observationTime);
		});

		it("mutating a returned createdAt Date does not affect the entity's own state", () => {
			const instance = makeObservation();

			instance.createdAt.setFullYear(1900);

			expect(instance.createdAt.getFullYear()).not.toBe(1900);
		});

		it("mutating a returned updatedAt Date does not affect the entity's own state", () => {
			const instance = makeObservation();

			instance.updatedAt.setFullYear(1900);

			expect(instance.updatedAt.getFullYear()).not.toBe(1900);
		});

		it("mutating a Date after passing it into create() does not affect the entity's reported observationTime", () => {
			const observationTime = new Date("2026-01-01T00:00:00Z");
			const instance = makeObservation({ observationTime });

			observationTime.setFullYear(1900);

			expect(instance.observationTime.getFullYear()).not.toBe(1900);
		});
	});
});

describe("SpatialObservation.selectCurrent()", () => {
	describe("Requirement: selects latest by observationTime, independent of array order (spec Req 5)", () => {
		it("returns the observation with the latest observationTime regardless of array position", () => {
			const jan = makeObservation({
				id: "obs-jan",
				observationTime: new Date("2026-01-01T00:00:00Z"),
			});
			const mar = makeObservation({
				id: "obs-mar",
				observationTime: new Date("2026-03-01T00:00:00Z"),
			});
			const feb = makeObservation({
				id: "obs-feb",
				observationTime: new Date("2026-02-01T00:00:00Z"),
			});

			expect(SpatialObservation.selectCurrent([jan, mar, feb])).toBe(mar);
		});

		it("does not select a backfilled earlier observationTime inserted last", () => {
			const latest = makeObservation({
				id: "obs-latest",
				observationTime: new Date("2026-03-01T00:00:00Z"),
			});
			const backfilled = makeObservation({
				id: "obs-backfilled",
				observationTime: new Date("2026-01-15T00:00:00Z"),
			});

			expect(SpatialObservation.selectCurrent([latest, backfilled])).toBe(
				latest,
			);
		});

		it("returns null for an empty array", () => {
			expect(SpatialObservation.selectCurrent([])).toBeNull();
		});

		it("returns the single observation when the array has exactly one entry", () => {
			const only = makeObservation();

			expect(SpatialObservation.selectCurrent([only])).toBe(only);
		});

		it("keeps the first-seen observation on an exact observationTime tie (design.md Decision 5)", () => {
			const tieTime = new Date("2026-02-01T00:00:00Z");
			const first = makeObservation({
				id: "obs-first",
				observationTime: new Date(tieTime),
			});
			const second = makeObservation({
				id: "obs-second",
				observationTime: new Date(tieTime),
			});

			expect(SpatialObservation.selectCurrent([first, second])).toBe(first);
		});
	});
});

describe("SpatialObservation.assertNoConflictingObservationTime()", () => {
	describe("Requirement: a second observation at the same observationTime is a conflict unless confirmReplace is set (spec Req 6)", () => {
		it("does not throw when there is no existing observation at that time", () => {
			expect(() =>
				SpatialObservation.assertNoConflictingObservationTime(null, false),
			).not.toThrow();
		});

		it("throws ConflictError when an observation already exists at that time and confirmReplace is false", () => {
			const existing = makeObservation();

			expect(() =>
				SpatialObservation.assertNoConflictingObservationTime(existing, false),
			).toThrow(ConflictError);
		});

		it("includes the conflicting hazardousEventId and observationTime in the thrown error's message", () => {
			const existing = makeObservation({
				hazardousEventId: "hazardous-event-77",
				observationTime: new Date("2026-04-05T00:00:00Z"),
			});

			expect(() =>
				SpatialObservation.assertNoConflictingObservationTime(existing, false),
			).toThrow(/hazardous-event-77/);
			expect(() =>
				SpatialObservation.assertNoConflictingObservationTime(existing, false),
			).toThrow(/2026-04-05T00:00:00\.000Z/);
			expect(() =>
				SpatialObservation.assertNoConflictingObservationTime(existing, false),
			).toThrow(/pass confirmReplace to replace it/);
		});

		it("attaches the conflicting hazardousEventId and observationTime as error context, not just the message", () => {
			const existing = makeObservation({
				hazardousEventId: "hazardous-event-77",
				observationTime: new Date("2026-04-05T00:00:00Z"),
			});

			try {
				SpatialObservation.assertNoConflictingObservationTime(existing, false);
				expect.unreachable(
					"expected assertNoConflictingObservationTime to throw",
				);
			} catch (error) {
				expect(error).toBeInstanceOf(ConflictError);
				const conflictError = error as ConflictError;
				expect(conflictError.context?.hazardousEventId).toBe(
					"hazardous-event-77",
				);
				expect(conflictError.context?.observationTime).toEqual(
					existing.observationTime,
				);
			}
		});

		it("does not throw when an observation already exists at that time but confirmReplace is true", () => {
			const existing = makeObservation();

			expect(() =>
				SpatialObservation.assertNoConflictingObservationTime(existing, true),
			).not.toThrow();
		});
	});

	describe("Requirement: concurrent callers racing to record an observation at the same time receive a consistent conflict contract (spec Req 7)", () => {
		// Contract for a future persistence adapter (roadmap 5e) — this zero-DB entity holds no shared state, so the losing-race scenario
		// can't be exercised here (design.md Decision 7 / spec.md Note). it.todo, not skipped, keeps the obligation visible in test output.
		it.todo(
			"5e's adapter must map a losing unique-constraint write to the same ConflictError assertNoConflictingObservationTime throws synchronously (design.md Decision 7)",
		);
	});
});
