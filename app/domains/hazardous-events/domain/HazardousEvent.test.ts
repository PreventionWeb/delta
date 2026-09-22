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
	hazardDriverIds: [],
	attachments: [],
	fieldValues: [],
	customFieldValues: [],
};

/** Wraps `HazardousEvent.create()` with defaulted empty valid-id sets -- most tests below don't
 * exercise the membership check, so this keeps call sites terse; the membership-specific tests
 * pass real, named sets explicitly instead of relying on this default (matches
 * `IHazardousEventRepository.test.ts`'s `makeHazardousEvent()` helper pattern). */
function createHazardousEvent(
	props: HazardousEventProps,
	validHazardDriverIds: ReadonlySet<string> = new Set(),
	validCustomFieldDefinitionIds: ReadonlySet<string> = new Set(),
): HazardousEvent {
	return HazardousEvent.create(
		props,
		validHazardDriverIds,
		validCustomFieldDefinitionIds,
	);
}

describe("HazardousEvent.create()", () => {
	describe("Happy paths", () => {
		it("returns a HazardousEvent instance when all required fields are present, endDate is empty, and attribution is null", () => {
			const instance = createHazardousEvent(baseProps);

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

			expect(() => createHazardousEvent(props)).not.toThrow();
		});
	});

	describe("Required field presence (design.md Decision 2/10)", () => {
		it("throws ValidationError when tenantId is empty", () => {
			const props: HazardousEventProps = { ...baseProps, tenantId: "" };

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
		});

		it("references tenantId in the error message when tenantId is empty", () => {
			const props: HazardousEventProps = { ...baseProps, tenantId: "" };

			expect(() => createHazardousEvent(props)).toThrow(/tenantId/);
		});

		it("throws ValidationError when specificHazardId is empty", () => {
			const props: HazardousEventProps = { ...baseProps, specificHazardId: "" };

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
		});

		it("references specificHazardId in the error message when specificHazardId is empty", () => {
			const props: HazardousEventProps = { ...baseProps, specificHazardId: "" };

			expect(() => createHazardousEvent(props)).toThrow(/specificHazardId/);
		});

		it("throws ValidationError when startDate is empty", () => {
			const props: HazardousEventProps = { ...baseProps, startDate: "" };

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
		});

		it("references startDate in the error message when startDate is empty", () => {
			const props: HazardousEventProps = { ...baseProps, startDate: "" };

			expect(() => createHazardousEvent(props)).toThrow(/startDate/);
		});

		// Whitespace-only must be rejected the same as "" -- a bare `.length === 0` check would let these through.
		it("throws ValidationError when tenantId is whitespace-only", () => {
			const props: HazardousEventProps = { ...baseProps, tenantId: "   " };

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
		});

		it("throws ValidationError when specificHazardId is whitespace-only", () => {
			const props: HazardousEventProps = {
				...baseProps,
				specificHazardId: "   ",
			};

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
		});

		it("throws ValidationError when startDate is whitespace-only", () => {
			const props: HazardousEventProps = { ...baseProps, startDate: "   " };

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
		});

		// Cast needed since HazardousEventProps types these `string`; a bare `.trim()` previously threw a raw TypeError here.
		it("throws ValidationError, not a TypeError, when tenantId is null or undefined", () => {
			const nullProps = {
				...baseProps,
				tenantId: null,
			} as unknown as HazardousEventProps;
			const undefinedProps = {
				...baseProps,
				tenantId: undefined,
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(nullProps)).toThrow(ValidationError);
			expect(() => createHazardousEvent(undefinedProps)).toThrow(
				ValidationError,
			);
		});

		it("throws ValidationError, not a TypeError, when tenantId is a non-string value", () => {
			const props = {
				...baseProps,
				tenantId: 12345,
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			expect(() => createHazardousEvent(props)).toThrow(/tenantId/);
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

			expect(() => createHazardousEvent(nullProps)).toThrow(ValidationError);
			expect(() => createHazardousEvent(undefinedProps)).toThrow(
				ValidationError,
			);
		});

		it("throws ValidationError, not a TypeError, when specificHazardId is a non-string value", () => {
			const props = {
				...baseProps,
				specificHazardId: 12345,
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			expect(() => createHazardousEvent(props)).toThrow(/specificHazardId/);
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

			expect(() => createHazardousEvent(nullProps)).toThrow(ValidationError);
			expect(() => createHazardousEvent(undefinedProps)).toThrow(
				ValidationError,
			);
		});

		it("throws ValidationError, not a TypeError, when startDate is a non-string value", () => {
			const props = {
				...baseProps,
				startDate: 12345,
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			expect(() => createHazardousEvent(props)).toThrow(/startDate/);
		});
	});

	describe("Date ordering (design.md Decision 3 -- carried forward from hazardous_event_create_update.ts)", () => {
		it("throws ValidationError when startDate is later than endDate", () => {
			const props: HazardousEventProps = {
				...baseProps,
				startDate: "2026-05-10",
				endDate: "2026-05-01",
			};

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
		});

		// Message-content assertion, closing the wording-only surviving mutant.
		it("references endDate in the error message when startDate is later than endDate", () => {
			const props: HazardousEventProps = {
				...baseProps,
				startDate: "2026-05-10",
				endDate: "2026-05-01",
			};

			expect(() => createHazardousEvent(props)).toThrow(/endDate/);
		});

		it("does not throw when startDate equals endDate", () => {
			const props: HazardousEventProps = {
				...baseProps,
				startDate: "2026-05-01",
				endDate: "2026-05-01",
			};

			expect(() => createHazardousEvent(props)).not.toThrow();
		});

		it("does not throw when startDate is before endDate", () => {
			const props: HazardousEventProps = {
				...baseProps,
				startDate: "2026-05-01",
				endDate: "2026-05-10",
			};

			expect(() => createHazardousEvent(props)).not.toThrow();
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

			expect(() => createHazardousEvent(nullProps)).not.toThrow();
			expect(() => createHazardousEvent(undefinedProps)).not.toThrow();
		});

		// Whitespace-only endDate is "not set," matching the required-field loop's trim rule.
		it("does not throw when endDate is whitespace-only", () => {
			const props: HazardousEventProps = {
				...baseProps,
				startDate: "2026-05-01",
				endDate: "   ",
			};

			expect(() => createHazardousEvent(props)).not.toThrow();
		});

		// endDate is optional, so a present-but-non-string value needs its own guard, not Decision 10's unconditional check (Decision 11).
		it("throws ValidationError, not a TypeError, when endDate is a non-string value", () => {
			const props = {
				...baseProps,
				endDate: 12345,
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			// Exact message, not just /endDate/ -- the ordering-check's own message also matches
			// /endDate/, so a bare pattern wouldn't catch a mutant that throws the wrong message.
			expect(() => createHazardousEvent(props)).toThrow(
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

			const instance = createHazardousEvent(props);

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

			expect(() => createHazardousEvent(props)).not.toThrow();
		});

		it("preserves a real UUID attribution value unchanged", () => {
			const uuid = "550e8400-e29b-41d4-a716-446655440000";
			const props: HazardousEventProps = {
				...baseProps,
				createdByUserId: uuid,
			};

			const instance = createHazardousEvent(props);

			expect(instance.createdByUserId).toBe(uuid);
		});

		// undefined must also normalize to null, not silently pass through.
		it("normalizes an undefined createdByUserId to null", () => {
			const props = {
				...baseProps,
				createdByUserId: undefined,
			} as unknown as HazardousEventProps;

			const instance = createHazardousEvent(props);

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
				hazardDriverIds: ["driver-1"],
				attachments: [
					{
						id: "att-1",
						title: "Photo",
						fileKey: "k1",
						fileName: "photo.jpg",
						fileType: "image/jpeg",
						fileSize: 204800,
					},
				],
				fieldValues: [{ hazardTypeFieldDefinitionId: "def-1", value: "5" }],
				customFieldValues: [
					{ hazardTypeCustomFieldDefinitionId: "custom-def-1", value: "a" },
				],
			};

			const instance = createHazardousEvent(
				props,
				new Set(["driver-1"]),
				new Set(["custom-def-1"]),
			);

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
			expect(instance.hazardDriverIds).toEqual(props.hazardDriverIds);
			expect(instance.attachments).toEqual(props.attachments);
			expect(instance.fieldValues).toEqual(props.fieldValues);
			expect(instance.customFieldValues).toEqual(props.customFieldValues);
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
			const instance = createHazardousEvent(baseProps);

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
			const instance = createHazardousEvent(props);

			props.description = "mutated after create()";

			expect(instance.description).toBe("original");
		});

		it("produces independent instances when two entities are built from the same base props with different overrides", () => {
			const first = createHazardousEvent({
				...baseProps,
				description: "first",
			});
			const second = createHazardousEvent({
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

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			});

			it("throws ValidationError, not a TypeError, when createdAt is null", () => {
				const props = {
					...baseProps,
					createdAt: null,
				} as unknown as HazardousEventProps;

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			});

			it("throws ValidationError, not a TypeError, when createdAt is a non-Date value", () => {
				const props = {
					...baseProps,
					createdAt: "2026-01-01",
				} as unknown as HazardousEventProps;

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			});

			it("throws ValidationError when createdAt is a syntactically-real but invalid Date", () => {
				const props: HazardousEventProps = {
					...baseProps,
					createdAt: new Date("garbage"),
				};

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
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

					expect(() => createHazardousEvent(props)).toThrow(/createdAt/);
				}
			});
		});

		describe("updatedAt (nullable, checked only when non-null)", () => {
			it("throws ValidationError, not a TypeError, when updatedAt is undefined", () => {
				const props = {
					...baseProps,
					updatedAt: undefined,
				} as unknown as HazardousEventProps;

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
				expect(() => createHazardousEvent(props)).toThrow(/updatedAt/);
			});

			it("throws ValidationError, not a TypeError, when updatedAt is a non-Date value", () => {
				const props = {
					...baseProps,
					updatedAt: "2026-01-01",
				} as unknown as HazardousEventProps;

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			});

			it("throws ValidationError when updatedAt is a syntactically-real but invalid Date", () => {
				const props: HazardousEventProps = {
					...baseProps,
					updatedAt: new Date("garbage"),
				};

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
				expect(() => createHazardousEvent(props)).toThrow(/updatedAt/);
			});

			it("does not throw when updatedAt is null", () => {
				const props: HazardousEventProps = { ...baseProps, updatedAt: null };

				expect(() => createHazardousEvent(props)).not.toThrow();
			});
		});

		describe("submittedAt (nullable, checked only when non-null)", () => {
			it("throws ValidationError, not a TypeError, when submittedAt is undefined", () => {
				const props = {
					...baseProps,
					submittedAt: undefined,
				} as unknown as HazardousEventProps;

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
				expect(() => createHazardousEvent(props)).toThrow(/submittedAt/);
			});

			it("throws ValidationError, not a TypeError, when submittedAt is a non-Date value", () => {
				const props = {
					...baseProps,
					submittedAt: "2026-01-01",
				} as unknown as HazardousEventProps;

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			});

			it("throws ValidationError when submittedAt is a syntactically-real but invalid Date", () => {
				const props: HazardousEventProps = {
					...baseProps,
					submittedAt: new Date("garbage"),
				};

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
				expect(() => createHazardousEvent(props)).toThrow(/submittedAt/);
			});

			it("does not throw when submittedAt is null", () => {
				const props: HazardousEventProps = { ...baseProps, submittedAt: null };

				expect(() => createHazardousEvent(props)).not.toThrow();
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

			expect(() => createHazardousEvent(props)).toThrow(/createdAt/);
		});
	});

	describe("Date getters return a clone, not the live internal instance (tasks.md 4.2)", () => {
		it("mutating a returned createdAt Date does not affect the entity's own state", () => {
			const instance = createHazardousEvent(baseProps);

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
			const instance = createHazardousEvent(props);

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
			const instance = createHazardousEvent(props);

			const returned = instance.submittedAt;
			returned?.setFullYear(1900);

			expect(instance.submittedAt?.getFullYear()).not.toBe(1900);
			expect(instance.submittedAt).toEqual(submittedAt);
		});

		it("mutating a Date after passing it into create() does not affect the entity's reported createdAt", () => {
			const createdAt = new Date("2026-01-01T00:00:00Z");
			const props: HazardousEventProps = { ...baseProps, createdAt };

			const instance = createHazardousEvent(props);
			createdAt.setFullYear(1900);

			expect(instance.createdAt.getFullYear()).not.toBe(1900);
		});
	});

	describe("HazardousEvent validates the hazard driver id collection (spec: hazardous-event-entity)", () => {
		it("does not throw for an empty hazardDriverIds array, regardless of validHazardDriverIds", () => {
			const props: HazardousEventProps = { ...baseProps, hazardDriverIds: [] };

			expect(() => createHazardousEvent(props)).not.toThrow();
		});

		it("accepts distinct hazard driver ids present in validHazardDriverIds", () => {
			const props: HazardousEventProps = {
				...baseProps,
				hazardDriverIds: ["driver-1", "driver-2"],
			};

			const instance = createHazardousEvent(
				props,
				new Set(["driver-1", "driver-2"]),
				new Set(),
			);

			expect(instance.hazardDriverIds).toEqual(["driver-1", "driver-2"]);
		});

		it("throws ValidationError referencing hazardDriverIds when it is not an array", () => {
			const props = {
				...baseProps,
				hazardDriverIds: null,
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			expect(() => createHazardousEvent(props)).toThrow(/hazardDriverIds/);
		});

		it("throws ValidationError when hazardDriverIds contains an empty or whitespace-only entry", () => {
			const emptyProps: HazardousEventProps = {
				...baseProps,
				hazardDriverIds: [""],
			};
			const whitespaceProps: HazardousEventProps = {
				...baseProps,
				hazardDriverIds: ["   "],
			};

			// validHazardDriverIds contains the literal invalid entry itself, so the membership check
			// alone could never explain the throw -- isolates the per-item shape check from the
			// membership check (mutation-testing finding: an empty valid-set masked this gap).
			expect(() =>
				createHazardousEvent(emptyProps, new Set([""]), new Set()),
			).toThrow(ValidationError);
			expect(() =>
				createHazardousEvent(emptyProps, new Set([""]), new Set()),
			).toThrow(/hazardDriverIds must not be empty/);
			expect(() =>
				createHazardousEvent(whitespaceProps, new Set(["   "]), new Set()),
			).toThrow(ValidationError);
			expect(() =>
				createHazardousEvent(whitespaceProps, new Set(["   "]), new Set()),
			).toThrow(/hazardDriverIds must not be empty/);
		});

		it("throws ValidationError when hazardDriverIds contains a duplicate value", () => {
			const props: HazardousEventProps = {
				...baseProps,
				hazardDriverIds: ["driver-1", "driver-1"],
			};

			expect(() =>
				createHazardousEvent(props, new Set(["driver-1"]), new Set()),
			).toThrow(ValidationError);
			expect(() =>
				createHazardousEvent(props, new Set(["driver-1"]), new Set()),
			).toThrow(
				/hazardDriverIds must not contain duplicate hazardDriverId values/,
			);
		});

		it("throws ValidationError naming the offending id when a hazardDriverId is absent from validHazardDriverIds", () => {
			const props: HazardousEventProps = {
				...baseProps,
				hazardDriverIds: ["driver-1"],
			};
			// Empty on purpose -- "driver-1" is absent from it, which is exactly what this test checks.
			const validHazardDriverIds: ReadonlySet<string> = new Set();

			expect(() => createHazardousEvent(props, validHazardDriverIds)).toThrow(
				ValidationError,
			);
			expect(() => createHazardousEvent(props, validHazardDriverIds)).toThrow(
				/hazardDriverId driver-1 is not present in validHazardDriverIds/,
			);
		});

		it("does not throw solely due to the membership check when hazardDriverIds is empty", () => {
			const props: HazardousEventProps = { ...baseProps, hazardDriverIds: [] };
			// Empty on purpose -- the point of this test is that an empty hazardDriverIds array
			// skips the membership check regardless of what this set contains.
			const validHazardDriverIds: ReadonlySet<string> = new Set();

			expect(() =>
				createHazardousEvent(props, validHazardDriverIds),
			).not.toThrow();
		});

		// "aab" distinguishes all 3 possible orderings: isArray-first (correct) rejects the whole
		// value; duplicate-first would flag duplicate chars instead; membership-first would flag a
		// stray character instead (design.md Decision 6, mirrors 3d Decision 8).
		it("rejects a non-array hazardDriverIds before any per-character duplicate or membership check runs", () => {
			const props = {
				...baseProps,
				hazardDriverIds: "aab",
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(props)).toThrow(
				/hazardDriverIds must be an array/,
			);
		});
	});

	describe("HazardousEvent validates the attachment collection (spec: hazardous-event-entity)", () => {
		const validAttachment = {
			id: "att-1",
			title: "Photo",
			fileKey: "k1",
			fileName: "photo.jpg",
			fileType: "image/jpeg",
			fileSize: 204800,
		};

		it("does not throw for an empty attachments array", () => {
			const props: HazardousEventProps = { ...baseProps, attachments: [] };

			expect(() => createHazardousEvent(props)).not.toThrow();
		});

		it("accepts a well-formed attachment and returns it unchanged", () => {
			const props: HazardousEventProps = {
				...baseProps,
				attachments: [validAttachment],
			};

			const instance = createHazardousEvent(props);

			expect(instance.attachments[0]).toEqual(validAttachment);
		});

		it("throws ValidationError referencing attachments when it is not an array", () => {
			const props = {
				...baseProps,
				attachments: null,
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			expect(() => createHazardousEvent(props)).toThrow(/attachments/);
		});

		it.each([null, undefined, "garbage"])(
			"throws ValidationError, not a TypeError, when an attachments element is %s",
			(element) => {
				const props = {
					...baseProps,
					attachments: [element],
				} as unknown as HazardousEventProps;

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
				expect(() => createHazardousEvent(props)).toThrow(/attachments/);
			},
		);

		// Each field must name itself in the error -- a mutant that always reports "title" would survive otherwise.
		it.each(["title", "fileKey", "fileName", "fileType"] as const)(
			"throws ValidationError referencing %s when it is empty",
			(field) => {
				const props: HazardousEventProps = {
					...baseProps,
					attachments: [{ ...validAttachment, [field]: "" }],
				};

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
				expect(() => createHazardousEvent(props)).toThrow(new RegExp(field));
			},
		);

		it("throws ValidationError when a required text field is whitespace-only", () => {
			const props: HazardousEventProps = {
				...baseProps,
				attachments: [{ ...validAttachment, title: "   " }],
			};

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
		});

		it("throws ValidationError referencing fileSize when it is not a finite integer", () => {
			const cases = [
				{ ...validAttachment, fileSize: "204800" },
				{ ...validAttachment, fileSize: NaN },
				{ ...validAttachment, fileSize: Infinity },
				{ ...validAttachment, fileSize: 1.5 },
			];

			for (const attachment of cases) {
				const props = {
					...baseProps,
					attachments: [attachment],
				} as unknown as HazardousEventProps;

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
				expect(() => createHazardousEvent(props)).toThrow(/fileSize/);
			}
		});

		it("does not throw solely because fileSize is 0 (shape only, no positivity rule)", () => {
			const props: HazardousEventProps = {
				...baseProps,
				attachments: [{ ...validAttachment, fileSize: 0 }],
			};

			expect(() => createHazardousEvent(props)).not.toThrow();
		});

		// Characterizes design.md Decision 2's deliberate gap: id is typed but unvalidated, matching HazardousEvent.id's existing treatment.
		it("does not throw when an attachment's id is an empty string", () => {
			const props: HazardousEventProps = {
				...baseProps,
				attachments: [{ ...validAttachment, id: "" }],
			};

			expect(() => createHazardousEvent(props)).not.toThrow();
		});
	});

	describe("HazardousEvent validates the hazard-type field value collection (spec: hazardous-event-entity)", () => {
		it("does not throw for an empty fieldValues array", () => {
			const props: HazardousEventProps = { ...baseProps, fieldValues: [] };

			expect(() => createHazardousEvent(props)).not.toThrow();
		});

		it("accepts distinct field definition ids, including an empty value", () => {
			const props: HazardousEventProps = {
				...baseProps,
				fieldValues: [
					{ hazardTypeFieldDefinitionId: "def-1", value: "5" },
					{ hazardTypeFieldDefinitionId: "def-2", value: "" },
				],
			};

			expect(() => createHazardousEvent(props)).not.toThrow();
		});

		it("throws ValidationError referencing fieldValues when it is not an array", () => {
			const props = {
				...baseProps,
				fieldValues: null,
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			expect(() => createHazardousEvent(props)).toThrow(/fieldValues/);
		});

		it.each([null, undefined, "garbage"])(
			"throws ValidationError, not a TypeError, when a fieldValues element is %s",
			(element) => {
				const props = {
					...baseProps,
					fieldValues: [element],
				} as unknown as HazardousEventProps;

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
				expect(() => createHazardousEvent(props)).toThrow(/fieldValues/);
			},
		);

		it("throws ValidationError referencing hazardTypeFieldDefinitionId when it is missing", () => {
			const props: HazardousEventProps = {
				...baseProps,
				fieldValues: [{ hazardTypeFieldDefinitionId: "  ", value: "5" }],
			};

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			expect(() => createHazardousEvent(props)).toThrow(
				/hazardTypeFieldDefinitionId/,
			);
		});

		it("throws ValidationError referencing value when it is not a string", () => {
			const props = {
				...baseProps,
				fieldValues: [{ hazardTypeFieldDefinitionId: "def-1", value: 5 }],
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			expect(() => createHazardousEvent(props)).toThrow(/value/);
		});

		it("throws ValidationError when fieldValues contains a duplicate definition id", () => {
			const props: HazardousEventProps = {
				...baseProps,
				fieldValues: [
					{ hazardTypeFieldDefinitionId: "def-1", value: "5" },
					{ hazardTypeFieldDefinitionId: "def-1", value: "6" },
				],
			};

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			expect(() => createHazardousEvent(props)).toThrow(
				/fieldValues must not contain duplicate hazardTypeFieldDefinitionId values/,
			);
		});
	});

	describe("HazardousEvent validates the hazard-type custom field value collection (spec: hazardous-event-entity)", () => {
		it("does not throw for an empty customFieldValues array, regardless of validCustomFieldDefinitionIds", () => {
			const props: HazardousEventProps = {
				...baseProps,
				customFieldValues: [],
			};

			expect(() => createHazardousEvent(props)).not.toThrow();
		});

		it("allows the same definition id in fieldValues and customFieldValues without conflict", () => {
			const props: HazardousEventProps = {
				...baseProps,
				fieldValues: [{ hazardTypeFieldDefinitionId: "def-1", value: "a" }],
				customFieldValues: [
					{ hazardTypeCustomFieldDefinitionId: "def-1", value: "b" },
				],
			};

			expect(() =>
				createHazardousEvent(props, new Set(), new Set(["def-1"])),
			).not.toThrow();
		});

		it("throws ValidationError referencing customFieldValues when it is not an array", () => {
			const props = {
				...baseProps,
				customFieldValues: null,
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			expect(() => createHazardousEvent(props)).toThrow(/customFieldValues/);
		});

		it.each([null, undefined, "garbage"])(
			"throws ValidationError, not a TypeError, when a customFieldValues element is %s",
			(element) => {
				const props = {
					...baseProps,
					customFieldValues: [element],
				} as unknown as HazardousEventProps;

				expect(() => createHazardousEvent(props)).toThrow(ValidationError);
				expect(() => createHazardousEvent(props)).toThrow(/customFieldValues/);
			},
		);

		it("throws ValidationError when customFieldValues contains a duplicate custom field definition id", () => {
			const props: HazardousEventProps = {
				...baseProps,
				customFieldValues: [
					{ hazardTypeCustomFieldDefinitionId: "def-1", value: "a" },
					{ hazardTypeCustomFieldDefinitionId: "def-1", value: "b" },
				],
			};

			expect(() =>
				createHazardousEvent(props, new Set(), new Set(["def-1"])),
			).toThrow(ValidationError);
			expect(() =>
				createHazardousEvent(props, new Set(), new Set(["def-1"])),
			).toThrow(
				/customFieldValues must not contain duplicate hazardTypeCustomFieldDefinitionId values/,
			);
		});

		it("throws ValidationError naming the offending id when a hazardTypeCustomFieldDefinitionId is absent from validCustomFieldDefinitionIds", () => {
			const props: HazardousEventProps = {
				...baseProps,
				customFieldValues: [
					{ hazardTypeCustomFieldDefinitionId: "def-1", value: "a" },
				],
			};
			// Empty on purpose -- "def-1" is absent from it, which is exactly what this test checks.
			const validCustomFieldDefinitionIds: ReadonlySet<string> = new Set();

			expect(() =>
				createHazardousEvent(props, new Set(), validCustomFieldDefinitionIds),
			).toThrow(ValidationError);
			expect(() =>
				createHazardousEvent(props, new Set(), validCustomFieldDefinitionIds),
			).toThrow(
				/hazardTypeCustomFieldDefinitionId def-1 is not present in validCustomFieldDefinitionIds/,
			);
		});

		it("does not throw solely due to the membership check when customFieldValues is empty", () => {
			const props: HazardousEventProps = {
				...baseProps,
				customFieldValues: [],
			};
			// Empty on purpose -- the point of this test is that an empty customFieldValues array
			// skips the membership check regardless of what this set contains.
			const validCustomFieldDefinitionIds: ReadonlySet<string> = new Set();

			expect(() =>
				createHazardousEvent(props, new Set(), validCustomFieldDefinitionIds),
			).not.toThrow();
		});

		it("never checks fieldValues's hazardTypeFieldDefinitionId against validCustomFieldDefinitionIds", () => {
			const props: HazardousEventProps = {
				...baseProps,
				fieldValues: [{ hazardTypeFieldDefinitionId: "def-1", value: "a" }],
			};
			// Deliberately excludes "def-1" -- if fieldValues were (incorrectly) checked against it, this would throw.
			const validCustomFieldDefinitionIds: ReadonlySet<string> = new Set();

			expect(() =>
				createHazardousEvent(props, new Set(), validCustomFieldDefinitionIds),
			).not.toThrow();
		});

		it("throws ValidationError referencing hazardTypeCustomFieldDefinitionId when it is missing", () => {
			const props: HazardousEventProps = {
				...baseProps,
				customFieldValues: [
					{ hazardTypeCustomFieldDefinitionId: "  ", value: "a" },
				],
			};

			expect(() => createHazardousEvent(props)).toThrow(ValidationError);
			expect(() => createHazardousEvent(props)).toThrow(
				/hazardTypeCustomFieldDefinitionId/,
			);
		});

		it("throws ValidationError referencing value when it is not a string", () => {
			const props = {
				...baseProps,
				customFieldValues: [
					{ hazardTypeCustomFieldDefinitionId: "def-1", value: 5 },
				],
			} as unknown as HazardousEventProps;

			expect(() =>
				createHazardousEvent(props, new Set(), new Set(["def-1"])),
			).toThrow(ValidationError);
			expect(() =>
				createHazardousEvent(props, new Set(), new Set(["def-1"])),
			).toThrow(/value/);
		});
	});

	describe("Validation ordering across the four new collections (design.md Decision 6)", () => {
		it("reports an existing required-field error before any new-collection error", () => {
			const props = {
				...baseProps,
				tenantId: "",
				hazardDriverIds: "not-an-array",
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(props)).toThrow(/tenantId/);
		});

		it("validates hazardDriverIds before attachments", () => {
			const props = {
				...baseProps,
				hazardDriverIds: "not-an-array",
				attachments: "not-an-array",
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(props)).toThrow(/hazardDriverIds/);
		});

		it("validates attachments before fieldValues", () => {
			const props = {
				...baseProps,
				attachments: "not-an-array",
				fieldValues: "not-an-array",
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(props)).toThrow(/attachments/);
		});

		it("validates fieldValues before customFieldValues", () => {
			const props = {
				...baseProps,
				fieldValues: "not-an-array",
				customFieldValues: "not-an-array",
			} as unknown as HazardousEventProps;

			expect(() => createHazardousEvent(props)).toThrow(/fieldValues/);
		});
	});

	describe("Child collection properties return a defensive copy, not the live internal array (spec: hazardous-event-entity)", () => {
		it("does not reflect a later push onto the array returned by a collection getter", () => {
			const props: HazardousEventProps = {
				...baseProps,
				hazardDriverIds: ["driver-1"],
			};
			const instance = createHazardousEvent(
				props,
				new Set(["driver-1"]),
				new Set(),
			);

			// Cast needed: the getter's return type is `readonly string[]`, but this test's whole
			// point is proving a caller who bypasses that type (e.g. via a JS caller) still can't mutate the entity.
			(instance.hazardDriverIds as string[]).push("driver-2");

			expect(instance.hazardDriverIds).toEqual(["driver-1"]);
		});

		it("does not reflect a later mutation of the original props array passed into create()", () => {
			const hazardDriverIds = ["driver-1"];
			const props: HazardousEventProps = { ...baseProps, hazardDriverIds };
			const instance = createHazardousEvent(
				props,
				new Set(["driver-1"]),
				new Set(),
			);

			hazardDriverIds.push("driver-2");

			expect(instance.hazardDriverIds).toEqual(["driver-1"]);
		});

		// Spec names all four collections; the getters share one clone pattern ([...props.x]), but
		// each is exercised directly rather than assumed identical.
		it("does not reflect a later push onto the array returned by the attachments getter", () => {
			const attachment = {
				id: "att-1",
				title: "Photo",
				fileKey: "k1",
				fileName: "photo.jpg",
				fileType: "image/jpeg",
				fileSize: 1,
			};
			const props: HazardousEventProps = {
				...baseProps,
				attachments: [attachment],
			};
			const instance = createHazardousEvent(props);

			(instance.attachments as (typeof attachment)[]).push(attachment);

			expect(instance.attachments).toEqual([attachment]);
		});

		it("does not reflect a later mutation of the original attachments array passed into create()", () => {
			const attachment = {
				id: "att-1",
				title: "Photo",
				fileKey: "k1",
				fileName: "photo.jpg",
				fileType: "image/jpeg",
				fileSize: 1,
			};
			const attachments = [attachment];
			const props: HazardousEventProps = { ...baseProps, attachments };
			const instance = createHazardousEvent(props);

			attachments.push(attachment);

			expect(instance.attachments).toEqual([attachment]);
		});

		// Characterizes design.md's Non-Goal: the defensive copy is array-level only (matches the
		// spec scenario's own wording), not a deep clone of each element.
		it("reflects a later mutation of an attachment element's own property (deliberately not deep-cloned)", () => {
			const attachment = {
				id: "att-1",
				title: "Photo",
				fileKey: "k1",
				fileName: "photo.jpg",
				fileType: "image/jpeg",
				fileSize: 1,
			};
			const props: HazardousEventProps = {
				...baseProps,
				attachments: [attachment],
			};
			const instance = createHazardousEvent(props);

			attachment.title = "mutated after create()";

			expect(instance.attachments[0].title).toBe("mutated after create()");
		});

		it("does not reflect a later push onto the array returned by the fieldValues getter", () => {
			const fieldValue = { hazardTypeFieldDefinitionId: "def-1", value: "5" };
			const props: HazardousEventProps = {
				...baseProps,
				fieldValues: [fieldValue],
			};
			const instance = createHazardousEvent(props);

			(instance.fieldValues as (typeof fieldValue)[]).push(fieldValue);

			expect(instance.fieldValues).toEqual([fieldValue]);
		});

		it("does not reflect a later push onto the array returned by the customFieldValues getter", () => {
			const customFieldValue = {
				hazardTypeCustomFieldDefinitionId: "def-1",
				value: "a",
			};
			const props: HazardousEventProps = {
				...baseProps,
				customFieldValues: [customFieldValue],
			};
			const instance = createHazardousEvent(
				props,
				new Set(),
				new Set(["def-1"]),
			);

			(instance.customFieldValues as (typeof customFieldValue)[]).push(
				customFieldValue,
			);

			expect(instance.customFieldValues).toEqual([customFieldValue]);
		});
	});
});
