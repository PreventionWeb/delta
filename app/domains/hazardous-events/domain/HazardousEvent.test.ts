import { describe, expect, it } from "vitest";
import { ValidationError } from "~/shared/errors";
import { HazardousEvent, type HazardousEventProps } from "./HazardousEvent";

const baseProps: HazardousEventProps = {
	id: "hazardous-event-1",
	tenantId: "tenant-1",
	specificHazardId: "specific-hazard-1",
	startDate: "2026-01-01",
	endDate: "",
	nationalSpecification: "",
	description: "",
	chainsExplanation: "",
	magnitude: "",
	recordOriginator: "",
	dataSource: "",
	hazardousEventStatus: null,
	specificHazardLocalName: null,
	specificHazardNationalName: null,
	apiImportId: null,
	createdByUserId: null,
	updatedByUserId: null,
	submittedByUserId: null,
	submittedAt: null,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: null,
};

describe("HazardousEvent.create()", () => {
	describe("Happy paths", () => {
		it("returns a HazardousEvent instance when all required fields are present, endDate is empty, and attribution is null", () => {
			const instance = HazardousEvent.create(baseProps);

			expect(instance).toBeInstanceOf(HazardousEvent);
			expect(instance.tenantId).toBe(baseProps.tenantId);
			expect(instance.specificHazardId).toBe(baseProps.specificHazardId);
			expect(instance.startDate).toBe(baseProps.startDate);
			expect(instance.endDate).toBe("");
			expect(instance.createdByUserId).toBeNull();
			expect(instance.updatedByUserId).toBeNull();
			expect(instance.submittedByUserId).toBeNull();
		});

		it("does not throw for an ongoing event with a non-empty startDate and an empty endDate", () => {
			const props: HazardousEventProps = {
				...baseProps,
				hazardousEventStatus: "ongoing",
				startDate: "2026-03-01",
				endDate: "",
			};

			expect(() => HazardousEvent.create(props)).not.toThrow();
		});
	});

	describe("Required field presence (design.md Decision 2/10)", () => {
		it("throws ValidationError when tenantId is empty", () => {
			const props: HazardousEventProps = { ...baseProps, tenantId: "" };

			expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
		});

		it("references tenantId in the error message when tenantId is empty", () => {
			const props: HazardousEventProps = { ...baseProps, tenantId: "" };

			expect(() => HazardousEvent.create(props)).toThrow(/tenantId/);
		});

		it("throws ValidationError when specificHazardId is empty", () => {
			const props: HazardousEventProps = { ...baseProps, specificHazardId: "" };

			expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
		});

		it("references specificHazardId in the error message when specificHazardId is empty", () => {
			const props: HazardousEventProps = { ...baseProps, specificHazardId: "" };

			expect(() => HazardousEvent.create(props)).toThrow(/specificHazardId/);
		});

		it("throws ValidationError when startDate is empty", () => {
			const props: HazardousEventProps = { ...baseProps, startDate: "" };

			expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
		});

		it("references startDate in the error message when startDate is empty", () => {
			const props: HazardousEventProps = { ...baseProps, startDate: "" };

			expect(() => HazardousEvent.create(props)).toThrow(/startDate/);
		});

		// Whitespace-only must be rejected the same as "" -- a bare `.length === 0` check would let these through (round 1 finding).
		it("throws ValidationError when tenantId is whitespace-only", () => {
			const props: HazardousEventProps = { ...baseProps, tenantId: "   " };

			expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError when specificHazardId is whitespace-only", () => {
			const props: HazardousEventProps = {
				...baseProps,
				specificHazardId: "   ",
			};

			expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError when startDate is whitespace-only", () => {
			const props: HazardousEventProps = { ...baseProps, startDate: "   " };

			expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
		});

		// Cast needed since HazardousEventProps types these `string`; a bare `.trim()` previously threw a raw TypeError here (Gate 8 finding).
		it("throws ValidationError, not a TypeError, when tenantId is null or undefined", () => {
			const nullProps = {
				...baseProps,
				tenantId: null,
			} as unknown as HazardousEventProps;
			const undefinedProps = {
				...baseProps,
				tenantId: undefined,
			} as unknown as HazardousEventProps;

			expect(() => HazardousEvent.create(nullProps)).toThrow(ValidationError);
			expect(() => HazardousEvent.create(undefinedProps)).toThrow(
				ValidationError,
			);
		});

		it("throws ValidationError, not a TypeError, when tenantId is a non-string value", () => {
			const props = {
				...baseProps,
				tenantId: 12345,
			} as unknown as HazardousEventProps;

			expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
			expect(() => HazardousEvent.create(props)).toThrow(/tenantId/);
		});

		it("throws ValidationError, not a TypeError, when specificHazardId is null or undefined", () => {
			const nullProps = {
				...baseProps,
				specificHazardId: null,
			} as unknown as HazardousEventProps;
			const undefinedProps = {
				...baseProps,
				specificHazardId: undefined,
			} as unknown as HazardousEventProps;

			expect(() => HazardousEvent.create(nullProps)).toThrow(ValidationError);
			expect(() => HazardousEvent.create(undefinedProps)).toThrow(
				ValidationError,
			);
		});

		it("throws ValidationError, not a TypeError, when specificHazardId is a non-string value", () => {
			const props = {
				...baseProps,
				specificHazardId: 12345,
			} as unknown as HazardousEventProps;

			expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
			expect(() => HazardousEvent.create(props)).toThrow(/specificHazardId/);
		});

		it("throws ValidationError, not a TypeError, when startDate is null or undefined", () => {
			const nullProps = {
				...baseProps,
				startDate: null,
			} as unknown as HazardousEventProps;
			const undefinedProps = {
				...baseProps,
				startDate: undefined,
			} as unknown as HazardousEventProps;

			expect(() => HazardousEvent.create(nullProps)).toThrow(ValidationError);
			expect(() => HazardousEvent.create(undefinedProps)).toThrow(
				ValidationError,
			);
		});

		it("throws ValidationError, not a TypeError, when startDate is a non-string value", () => {
			const props = {
				...baseProps,
				startDate: 12345,
			} as unknown as HazardousEventProps;

			expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
			expect(() => HazardousEvent.create(props)).toThrow(/startDate/);
		});
	});

	describe("Date ordering (design.md Decision 3 -- carried forward from hazardous_event_create_update.ts)", () => {
		it("throws ValidationError when startDate is later than endDate", () => {
			const props: HazardousEventProps = {
				...baseProps,
				startDate: "2026-05-10",
				endDate: "2026-05-01",
			};

			expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
		});

		// Message-content assertion, closing the wording-only surviving mutant (round 1 finding).
		it("references endDate in the error message when startDate is later than endDate", () => {
			const props: HazardousEventProps = {
				...baseProps,
				startDate: "2026-05-10",
				endDate: "2026-05-01",
			};

			expect(() => HazardousEvent.create(props)).toThrow(/endDate/);
		});

		it("does not throw when startDate equals endDate", () => {
			const props: HazardousEventProps = {
				...baseProps,
				startDate: "2026-05-01",
				endDate: "2026-05-01",
			};

			expect(() => HazardousEvent.create(props)).not.toThrow();
		});

		it("does not throw when startDate is before endDate", () => {
			const props: HazardousEventProps = {
				...baseProps,
				startDate: "2026-05-01",
				endDate: "2026-05-10",
			};

			expect(() => HazardousEvent.create(props)).not.toThrow();
		});

		// endDate is optional -- null/undefined must skip the ordering check, not crash (Gate 8 nitpick).
		it("does not throw when endDate is null or undefined", () => {
			const nullProps = {
				...baseProps,
				endDate: null,
			} as unknown as HazardousEventProps;
			const undefinedProps = {
				...baseProps,
				endDate: undefined,
			} as unknown as HazardousEventProps;

			expect(() => HazardousEvent.create(nullProps)).not.toThrow();
			expect(() => HazardousEvent.create(undefinedProps)).not.toThrow();
		});

		// Whitespace-only endDate is "not set," matching the required-field loop's trim rule (Gate 10 finding).
		it("does not throw when endDate is whitespace-only", () => {
			const props: HazardousEventProps = {
				...baseProps,
				startDate: "2026-05-01",
				endDate: "   ",
			};

			expect(() => HazardousEvent.create(props)).not.toThrow();
		});

		// endDate is optional, so a present-but-non-string value needs its own guard, not Decision 10's unconditional check (Decision 11).
		it("throws ValidationError, not a TypeError, when endDate is a non-string value", () => {
			const props = {
				...baseProps,
				endDate: 12345,
			} as unknown as HazardousEventProps;

			expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
			// Exact message, not just /endDate/ -- the ordering-check's own message also matches
			// /endDate/, so a bare pattern wouldn't catch a mutant that throws the wrong message
			// (Gate 8 finding, round 4: Decision 11 requires these two messages stay distinguishable).
			expect(() => HazardousEvent.create(props)).toThrow(
				/endDate must be a string/,
			);
		});
	});

	describe("Attribution field normalization (design.md Decision 4 -- DEF-006)", () => {
		it("normalizes empty-string createdByUserId, updatedByUserId, and submittedByUserId to null", () => {
			const props: HazardousEventProps = {
				...baseProps,
				createdByUserId: "",
				updatedByUserId: "",
				submittedByUserId: "",
			};

			const instance = HazardousEvent.create(props);

			expect(instance.createdByUserId).toBeNull();
			expect(instance.updatedByUserId).toBeNull();
			expect(instance.submittedByUserId).toBeNull();
		});

		it("does not throw when attribution fields are empty strings", () => {
			const props: HazardousEventProps = {
				...baseProps,
				createdByUserId: "",
				updatedByUserId: "",
				submittedByUserId: "",
			};

			expect(() => HazardousEvent.create(props)).not.toThrow();
		});

		it("preserves a real UUID attribution value unchanged", () => {
			const uuid = "550e8400-e29b-41d4-a716-446655440000";
			const props: HazardousEventProps = {
				...baseProps,
				createdByUserId: uuid,
			};

			const instance = HazardousEvent.create(props);

			expect(instance.createdByUserId).toBe(uuid);
		});

		// undefined must also normalize to null, not silently pass through (Gate 10 finding).
		it("normalizes an undefined createdByUserId to null", () => {
			const props = {
				...baseProps,
				createdByUserId: undefined,
			} as unknown as HazardousEventProps;

			const instance = HazardousEvent.create(props);

			expect(instance.createdByUserId).toBeNull();
		});
	});

	describe("HazardousEvent exposes all retained columns read-only (spec: hazardous-event-entity)", () => {
		it("returns the value passed in props for every retained column", () => {
			const props: HazardousEventProps = {
				id: "he-1",
				tenantId: "tenant-1",
				specificHazardId: "hazard-1",
				startDate: "2026-01-01",
				endDate: "2026-02-01",
				nationalSpecification: "national spec",
				description: "a description",
				chainsExplanation: "chains explanation",
				magnitude: "5.0",
				recordOriginator: "originator",
				dataSource: "source",
				hazardousEventStatus: "ongoing",
				specificHazardLocalName: "local name",
				specificHazardNationalName: "national name",
				apiImportId: "import-1",
				createdByUserId: "550e8400-e29b-41d4-a716-446655440000",
				updatedByUserId: "550e8400-e29b-41d4-a716-446655440001",
				submittedByUserId: "550e8400-e29b-41d4-a716-446655440002",
				submittedAt: new Date("2026-01-05T00:00:00Z"),
				createdAt: new Date("2026-01-01T00:00:00Z"),
				updatedAt: new Date("2026-01-02T00:00:00Z"),
			};

			const instance = HazardousEvent.create(props);

			expect(instance.id).toBe(props.id);
			expect(instance.tenantId).toBe(props.tenantId);
			expect(instance.specificHazardId).toBe(props.specificHazardId);
			expect(instance.startDate).toBe(props.startDate);
			expect(instance.endDate).toBe(props.endDate);
			expect(instance.nationalSpecification).toBe(props.nationalSpecification);
			expect(instance.description).toBe(props.description);
			expect(instance.chainsExplanation).toBe(props.chainsExplanation);
			expect(instance.magnitude).toBe(props.magnitude);
			expect(instance.recordOriginator).toBe(props.recordOriginator);
			expect(instance.dataSource).toBe(props.dataSource);
			expect(instance.hazardousEventStatus).toBe(props.hazardousEventStatus);
			expect(instance.specificHazardLocalName).toBe(
				props.specificHazardLocalName,
			);
			expect(instance.specificHazardNationalName).toBe(
				props.specificHazardNationalName,
			);
			expect(instance.apiImportId).toBe(props.apiImportId);
			expect(instance.createdByUserId).toBe(props.createdByUserId);
			expect(instance.updatedByUserId).toBe(props.updatedByUserId);
			expect(instance.submittedByUserId).toBe(props.submittedByUserId);
			expect(instance.submittedAt).toEqual(props.submittedAt);
			expect(instance.createdAt).toEqual(props.createdAt);
			expect(instance.updatedAt).toEqual(props.updatedAt);
		});
	});

	describe("Carries no approval-status or HIP-hierarchy property (characterization -- spec: hazardous-event-entity)", () => {
		const excludedProps = [
			"status",
			"approvalStatus",
			"validatedByUserId",
			"validatedAt",
			"publishedByUserId",
			"publishedAt",
			"hipHazardId",
			"hipClusterId",
			"hipTypeId",
		] as const;

		it("does not expose any excluded approval-status or HIP-hierarchy property on the constructed instance", () => {
			const instance = HazardousEvent.create(baseProps);

			// Positive control: proves `in` finds a real getter here, so the negative checks below can't pass vacuously.
			expect("tenantId" in instance).toBe(true);

			for (const prop of excludedProps) {
				// `in` walks the prototype chain, so this also catches a getter, not just an own-enumerable data property.
				expect(prop in instance).toBe(false);
			}
		});

		// Compile-time companion to the runtime check above -- fails to compile if HazardousEventProps ever regains one of these keys.
		type ExcludedKey =
			| "status"
			| "approvalStatus"
			| "validatedByUserId"
			| "validatedAt"
			| "publishedByUserId"
			| "publishedAt"
			| "hipHazardId"
			| "hipClusterId"
			| "hipTypeId";
		type _NoExcludedPropsOnProps =
			Extract<keyof HazardousEventProps, ExcludedKey> extends never
				? true
				: never;
		const _noExcludedPropsOnProps: _NoExcludedPropsOnProps = true;
		void _noExcludedPropsOnProps;
	});

	describe("Immutability (tasks.md 4.1)", () => {
		// Mutable view for this one runtime test (no-shared-reference), distinct from the compile-time readonly check below.
		type MutableHazardousEventProps = {
			-readonly [K in keyof HazardousEventProps]: HazardousEventProps[K];
		};

		it("does not reflect a later mutation of the input props object", () => {
			const props: MutableHazardousEventProps = {
				...baseProps,
				description: "original",
			};
			const instance = HazardousEvent.create(props);

			props.description = "mutated after create()";

			expect(instance.description).toBe("original");
		});

		it("produces independent instances when two entities are built from the same base props with different overrides", () => {
			const first = HazardousEvent.create({
				...baseProps,
				description: "first",
			});
			const second = HazardousEvent.create({
				...baseProps,
				description: "second",
			});

			expect(first.description).toBe("first");
			expect(second.description).toBe("second");
			expect(first).not.toBe(second);
		});

		// Compile-time companion (design.md Decision 1): fails to compile if `id` is ever widened to mutable.
		function _assertPropsFieldIsReadonly(props: HazardousEventProps): void {
			// @ts-expect-error -- id is declared readonly; direct reassignment must not compile.
			props.id = "reassigned";
		}
		void _assertPropsFieldIsReadonly;
	});

	describe("Date validity (design.md Decision 9, tasks.md 10.1)", () => {
		describe("createdAt (required, checked unconditionally)", () => {
			it("throws ValidationError, not a TypeError, when createdAt is undefined", () => {
				const props = {
					...baseProps,
					createdAt: undefined,
				} as unknown as HazardousEventProps;

				expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
			});

			it("throws ValidationError, not a TypeError, when createdAt is null", () => {
				const props = {
					...baseProps,
					createdAt: null,
				} as unknown as HazardousEventProps;

				expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
			});

			it("throws ValidationError, not a TypeError, when createdAt is a non-Date value", () => {
				const props = {
					...baseProps,
					createdAt: "2026-01-01",
				} as unknown as HazardousEventProps;

				expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
			});

			it("throws ValidationError when createdAt is a syntactically-real but invalid Date", () => {
				const props: HazardousEventProps = {
					...baseProps,
					createdAt: new Date("garbage"),
				};

				expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
			});

			it("references createdAt in the error message for each invalid shape", () => {
				const shapes: unknown[] = [
					undefined,
					null,
					"2026-01-01",
					new Date("garbage"),
				];

				for (const createdAt of shapes) {
					const props = {
						...baseProps,
						createdAt,
					} as unknown as HazardousEventProps;

					expect(() => HazardousEvent.create(props)).toThrow(/createdAt/);
				}
			});
		});

		describe("updatedAt (nullable, checked only when non-null)", () => {
			it("throws ValidationError, not a TypeError, when updatedAt is undefined", () => {
				const props = {
					...baseProps,
					updatedAt: undefined,
				} as unknown as HazardousEventProps;

				expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
				expect(() => HazardousEvent.create(props)).toThrow(/updatedAt/);
			});

			it("throws ValidationError, not a TypeError, when updatedAt is a non-Date value", () => {
				const props = {
					...baseProps,
					updatedAt: "2026-01-01",
				} as unknown as HazardousEventProps;

				expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
			});

			it("throws ValidationError when updatedAt is a syntactically-real but invalid Date", () => {
				const props: HazardousEventProps = {
					...baseProps,
					updatedAt: new Date("garbage"),
				};

				expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
				expect(() => HazardousEvent.create(props)).toThrow(/updatedAt/);
			});

			it("does not throw when updatedAt is null", () => {
				const props: HazardousEventProps = { ...baseProps, updatedAt: null };

				expect(() => HazardousEvent.create(props)).not.toThrow();
			});
		});

		describe("submittedAt (nullable, checked only when non-null)", () => {
			it("throws ValidationError, not a TypeError, when submittedAt is undefined", () => {
				const props = {
					...baseProps,
					submittedAt: undefined,
				} as unknown as HazardousEventProps;

				expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
				expect(() => HazardousEvent.create(props)).toThrow(/submittedAt/);
			});

			it("throws ValidationError, not a TypeError, when submittedAt is a non-Date value", () => {
				const props = {
					...baseProps,
					submittedAt: "2026-01-01",
				} as unknown as HazardousEventProps;

				expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
			});

			it("throws ValidationError when submittedAt is a syntactically-real but invalid Date", () => {
				const props: HazardousEventProps = {
					...baseProps,
					submittedAt: new Date("garbage"),
				};

				expect(() => HazardousEvent.create(props)).toThrow(ValidationError);
				expect(() => HazardousEvent.create(props)).toThrow(/submittedAt/);
			});

			it("does not throw when submittedAt is null", () => {
				const props: HazardousEventProps = { ...baseProps, submittedAt: null };

				expect(() => HazardousEvent.create(props)).not.toThrow();
			});
		});

		// Date-validity must be reported before the startDate/endDate ordering check (design.md Decision 9).
		it("reports an invalid createdAt, not a startDate/endDate ordering error, when both are wrong", () => {
			const props: HazardousEventProps = {
				...baseProps,
				createdAt: new Date("garbage"),
				startDate: "2026-05-10",
				endDate: "2026-05-01",
			};

			expect(() => HazardousEvent.create(props)).toThrow(/createdAt/);
		});
	});

	describe("Date getters return a clone, not the live internal instance (tasks.md 4.2)", () => {
		it("mutating a returned createdAt Date does not affect the entity's own state", () => {
			const instance = HazardousEvent.create(baseProps);

			const returned = instance.createdAt;
			returned.setFullYear(1900);

			expect(instance.createdAt.getFullYear()).not.toBe(1900);
			expect(instance.createdAt).toEqual(baseProps.createdAt);
		});

		it("mutating a returned updatedAt Date does not affect the entity's own state", () => {
			const props: HazardousEventProps = {
				...baseProps,
				updatedAt: new Date("2026-01-02T00:00:00Z"),
			};
			const instance = HazardousEvent.create(props);

			const returned = instance.updatedAt;
			returned?.setFullYear(1900);

			expect(instance.updatedAt?.getFullYear()).not.toBe(1900);
		});

		it("mutating a returned submittedAt Date does not affect the entity's own state", () => {
			const submittedAt = new Date("2026-01-05T00:00:00Z");
			const props: HazardousEventProps = {
				...baseProps,
				submittedByUserId: "550e8400-e29b-41d4-a716-446655440002",
				submittedAt,
			};
			const instance = HazardousEvent.create(props);

			const returned = instance.submittedAt;
			returned?.setFullYear(1900);

			expect(instance.submittedAt?.getFullYear()).not.toBe(1900);
			expect(instance.submittedAt).toEqual(submittedAt);
		});

		it("mutating a Date after passing it into create() does not affect the entity's reported createdAt", () => {
			const createdAt = new Date("2026-01-01T00:00:00Z");
			const props: HazardousEventProps = { ...baseProps, createdAt };

			const instance = HazardousEvent.create(props);
			createdAt.setFullYear(1900);

			expect(instance.createdAt.getFullYear()).not.toBe(1900);
		});
	});
});
