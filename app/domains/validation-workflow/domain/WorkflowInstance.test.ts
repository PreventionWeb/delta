import { describe, expect, it } from "vitest";
import { ConflictError, ValidationError } from "~/shared/errors";
import {
	STATUS_VALUES,
	WorkflowInstance,
	type Status,
	type WorkflowInstanceProps,
} from "./WorkflowInstance";

const baseProps: WorkflowInstanceProps = {
	id: "workflow-instance-1",
	entityId: "entity-1",
	entityType: "HE",
	status: "DRAFT",
	submittedByUserId: null,
	submittedAt: null,
	validatedByUserId: null,
	validatedAt: null,
	approvedByUserId: null,
	approvedAt: null,
	publishedByUserId: null,
	publishedAt: null,
	createdAt: new Date("2024-01-01T00:00:00Z"),
	updatedAt: new Date("2024-01-01T00:00:00Z"),
};

const fixtureNow = new Date("2024-01-15T00:00:00Z");

/** A valid attribution combination for the given status, per design.md Decision 7. REJECTED is unvalidated by create(), so any combination works — DRAFT's is the all-null default. */
function validPropsForStatus(status: Status): Partial<WorkflowInstanceProps> {
	if (status === "DRAFT" || status === "REJECTED") return { status };

	const submitted = {
		submittedByUserId: "user-1",
		submittedAt: fixtureNow,
	};
	if (status === "SUBMITTED" || status === "REVISION_REQUESTED") {
		return { status, ...submitted };
	}

	const approved = { approvedByUserId: "approver-1", approvedAt: fixtureNow };
	if (status === "APPROVED") {
		return { status, ...submitted, ...approved };
	}

	// PUBLISHED
	return {
		status,
		...submitted,
		validatedByUserId: "validator-1",
		validatedAt: fixtureNow,
		...approved,
		publishedByUserId: "publisher-1",
		publishedAt: fixtureNow,
	};
}

describe("WorkflowInstance.create()", () => {
	describe("Happy paths", () => {
		it("returns a WorkflowInstance instance for a fresh DRAFT with no attribution set", () => {
			const instance = WorkflowInstance.create(baseProps);

			expect(instance).toBeInstanceOf(WorkflowInstance);
			expect(instance.status).toBe("DRAFT");
			expect(instance.entityId).toBe("entity-1");
			expect(instance.entityType).toBe("HE");
			expect(instance.submittedByUserId).toBeNull();
			expect(instance.submittedAt).toBeNull();
			expect(instance.validatedByUserId).toBeNull();
			expect(instance.validatedAt).toBeNull();
			expect(instance.approvedByUserId).toBeNull();
			expect(instance.approvedAt).toBeNull();
			expect(instance.publishedByUserId).toBeNull();
			expect(instance.publishedAt).toBeNull();
		});

		it("returns a WorkflowInstance instance when reconstituting a SUBMITTED row with partial attribution set", () => {
			const props: WorkflowInstanceProps = {
				...baseProps,
				status: "SUBMITTED",
				submittedByUserId: "user-1",
				submittedAt: new Date("2024-02-01T00:00:00Z"),
			};

			const instance = WorkflowInstance.create(props);

			expect(instance).toBeInstanceOf(WorkflowInstance);
			expect(instance.submittedByUserId).toBe("user-1");
			expect(instance.submittedAt).toEqual(props.submittedAt);
		});
	});

	describe("Failure paths", () => {
		// `as unknown as WorkflowInstanceProps` below: deliberately bypasses the literal-union
		// type to construct runtime-invalid input, exercising create()'s own guard.
		it("throws ValidationError when entityType is not HE, DE, or DR", () => {
			const props = {
				...baseProps,
				entityType: "XX",
			} as unknown as WorkflowInstanceProps;

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError with a message referencing entityType when entityType is invalid", () => {
			const props = {
				...baseProps,
				entityType: "XX",
			} as unknown as WorkflowInstanceProps;

			expect(() => WorkflowInstance.create(props)).toThrow(/entityType/);
		});

		it("throws ValidationError when status is not a member of the status enum", () => {
			const props = {
				...baseProps,
				status: "IN_REVIEW",
			} as unknown as WorkflowInstanceProps;

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError with a message referencing status when status is invalid", () => {
			const props = {
				...baseProps,
				status: "IN_REVIEW",
			} as unknown as WorkflowInstanceProps;

			expect(() => WorkflowInstance.create(props)).toThrow(/status/);
		});
	});

	describe("All properties are accessible after construction", () => {
		it("exposes every WorkflowInstanceProps field via a getter that returns the value passed in props", () => {
			const props: WorkflowInstanceProps = {
				id: "workflow-instance-42",
				entityId: "entity-99",
				entityType: "DE",
				status: "PUBLISHED",
				submittedByUserId: "user-1",
				submittedAt: new Date("2024-01-01T00:00:00Z"),
				validatedByUserId: "user-2",
				validatedAt: new Date("2024-01-02T00:00:00Z"),
				approvedByUserId: "user-3",
				approvedAt: new Date("2024-01-03T00:00:00Z"),
				publishedByUserId: "user-4",
				publishedAt: new Date("2024-01-04T00:00:00Z"),
				createdAt: new Date("2023-12-01T00:00:00Z"),
				updatedAt: new Date("2024-01-04T00:00:00Z"),
			};

			const instance = WorkflowInstance.create(props);

			expect(instance.id).toBe(props.id);
			expect(instance.entityId).toBe(props.entityId);
			expect(instance.entityType).toBe(props.entityType);
			expect(instance.status).toBe(props.status);
			expect(instance.submittedByUserId).toBe(props.submittedByUserId);
			expect(instance.submittedAt).toEqual(props.submittedAt);
			expect(instance.validatedByUserId).toBe(props.validatedByUserId);
			expect(instance.validatedAt).toEqual(props.validatedAt);
			expect(instance.approvedByUserId).toBe(props.approvedByUserId);
			expect(instance.approvedAt).toEqual(props.approvedAt);
			expect(instance.publishedByUserId).toBe(props.publishedByUserId);
			expect(instance.publishedAt).toEqual(props.publishedAt);
			expect(instance.createdAt).toEqual(props.createdAt);
			expect(instance.updatedAt).toEqual(props.updatedAt);
		});
	});

	describe("Date getters return a clone, not the live internal instance", () => {
		it("mutating a returned submittedAt Date does not affect the entity's own state", () => {
			const instance = WorkflowInstance.create({
				...baseProps,
				...validPropsForStatus("SUBMITTED"),
			});

			const returnedDate = instance.submittedAt;
			returnedDate?.setFullYear(1900);

			expect(instance.submittedAt?.getFullYear()).not.toBe(1900);
			expect(instance.submittedAt).toEqual(fixtureNow);
		});

		it("mutating a returned createdAt Date does not affect the entity's own state", () => {
			const instance = WorkflowInstance.create(baseProps);

			const returnedDate = instance.createdAt;
			returnedDate.setFullYear(1900);

			expect(instance.createdAt.getFullYear()).not.toBe(1900);
			expect(instance.createdAt).toEqual(baseProps.createdAt);
		});
	});

	describe("Defensive copy of Date fields on construction", () => {
		it("mutating a Date after passing it into create() does not affect the entity's reported value", () => {
			const submittedAt = new Date("2024-02-01T00:00:00Z");
			const props: WorkflowInstanceProps = {
				...baseProps,
				status: "SUBMITTED",
				submittedByUserId: "user-1",
				submittedAt,
			};

			const instance = WorkflowInstance.create(props);
			submittedAt.setFullYear(1900);

			expect(instance.submittedAt?.getFullYear()).not.toBe(1900);
		});

		it("mutating createdAt after passing it into create() does not affect the entity's reported value", () => {
			const createdAt = new Date("2024-01-01T00:00:00Z");
			const props: WorkflowInstanceProps = { ...baseProps, createdAt };

			const instance = WorkflowInstance.create(props);
			createdAt.setFullYear(1900);

			expect(instance.createdAt.getFullYear()).not.toBe(1900);
		});

		it("mutating updatedAt after passing it into create() does not affect the entity's reported value", () => {
			const updatedAt = new Date("2024-01-01T00:00:00Z");
			const props: WorkflowInstanceProps = { ...baseProps, updatedAt };

			const instance = WorkflowInstance.create(props);
			updatedAt.setFullYear(1900);

			expect(instance.updatedAt.getFullYear()).not.toBe(1900);
		});

		it("mutating a shared `now` Date after a transition does not affect the returned instance's stamped fields", () => {
			const instance = WorkflowInstance.create(baseProps);
			const now = new Date("2024-03-01T00:00:00Z");

			const result = instance.submit({ userId: "user-1", now });
			now.setFullYear(1900);

			expect(result.submittedAt?.getFullYear()).not.toBe(1900);
			expect(result.updatedAt.getFullYear()).not.toBe(1900);
		});
	});

	describe("Timestamp validity", () => {
		it("throws ValidationError when createdAt is an invalid Date", () => {
			const props = { ...baseProps, createdAt: new Date("not-a-date") };

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it("includes the field name in the createdAt validity error message", () => {
			const props = { ...baseProps, createdAt: new Date("not-a-date") };

			expect(() => WorkflowInstance.create(props)).toThrow(
				"createdAt must be a valid Date",
			);
		});

		it("throws ValidationError when updatedAt is an invalid Date", () => {
			const props = { ...baseProps, updatedAt: new Date("not-a-date") };

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it("includes the field name in the updatedAt validity error message", () => {
			const props = { ...baseProps, updatedAt: new Date("not-a-date") };

			expect(() => WorkflowInstance.create(props)).toThrow(
				"updatedAt must be a valid Date",
			);
		});

		// Exercises the `instanceof Date` disjunct itself, not just the NaN-time disjunct —
		// a non-Date value bypasses TypeScript's type at runtime the same way a bad DB row would.
		it("throws ValidationError when createdAt is not a Date instance at all", () => {
			const props = {
				...baseProps,
				createdAt: "2024-01-01T00:00:00Z",
			} as unknown as WorkflowInstanceProps;

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError when updatedAt is not a Date instance at all", () => {
			const props = {
				...baseProps,
				updatedAt: "2024-01-01T00:00:00Z",
			} as unknown as WorkflowInstanceProps;

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});
	});

	describe("Attribution timestamp validity (design.md Decision 9, round 4)", () => {
		it.each(["submitted", "validated", "approved", "published"] as const)(
			"throws ValidationError referencing %sAt when it is an invalid Date",
			(pair) => {
				const props = {
					...baseProps,
					...validPropsForStatus("PUBLISHED"),
					[`${pair}At`]: new Date("not-a-date"),
				} as unknown as WorkflowInstanceProps;

				expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
				expect(() => WorkflowInstance.create(props)).toThrow(
					`${pair}At must be a valid Date`,
				);
			},
		);

		// Exercises the `instanceof Date` disjunct itself (round 3 Gate 10's finding for
		// createdAt/updatedAt applies equally to the four attribution fields).
		it.each(["submitted", "validated", "approved", "published"] as const)(
			"throws ValidationError when %sAt is not a Date instance at all",
			(pair) => {
				const props = {
					...baseProps,
					...validPropsForStatus("PUBLISHED"),
					[`${pair}At`]: "2024-01-01T00:00:00Z",
				} as unknown as WorkflowInstanceProps;

				expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
			},
		);

		// Gate 8 (round 4) finding: the two PAIR_NAMES loops in create() only differ in
		// observable behavior when byUserId is null and At is a non-null invalid Date — the
		// only input shape where the Date-validity loop and the pair-consistency loop would
		// disagree on which error to throw. Pins that the Date-validity loop (which runs
		// first) wins, per design.md Decision 9's ordering claim.
		it.each(["submitted", "validated", "approved", "published"] as const)(
			"reports the %sAt Date-validity error, not the pair-consistency error, when %sByUserId is null and %sAt is an invalid Date",
			(pair) => {
				const props = {
					...baseProps,
					...validPropsForStatus("PUBLISHED"),
					[`${pair}ByUserId`]: null,
					[`${pair}At`]: new Date("not-a-date"),
				} as unknown as WorkflowInstanceProps;

				expect(() => WorkflowInstance.create(props)).toThrow(
					`${pair}At must be a valid Date`,
				);
			},
		);
	});

	describe("Attribution pair consistency (design.md Decision 7)", () => {
		it.each(["submitted", "validated", "approved", "published"] as const)(
			"throws ValidationError when %sByUserId is set but %sAt is null",
			(pair) => {
				const props = {
					...baseProps,
					...validPropsForStatus("PUBLISHED"),
					[`${pair}At`]: null,
				} as unknown as WorkflowInstanceProps;

				expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
			},
		);

		it.each(["submitted", "validated", "approved", "published"] as const)(
			"throws ValidationError when %sAt is set but %sByUserId is null",
			(pair) => {
				const props = {
					...baseProps,
					...validPropsForStatus("PUBLISHED"),
					[`${pair}ByUserId`]: null,
				} as unknown as WorkflowInstanceProps;

				expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
			},
		);

		it("throws specifically due to pair consistency (not a status-required rule) when SUBMITTED has a split validated pair", () => {
			// SUBMITTED's REQUIRED_SET (["submitted"]) and REQUIRED_NULL (["approved","published"])
			// never mention "validated" — only the pair-consistency loop can reject this input.
			const props: WorkflowInstanceProps = {
				...baseProps,
				...validPropsForStatus("SUBMITTED"),
				validatedByUserId: null,
				validatedAt: fixtureNow,
			};

			expect(() => WorkflowInstance.create(props)).toThrow(
				/both null or both set/,
			);
		});
	});

	describe("Status-required attribution (design.md Decision 7)", () => {
		it("throws ValidationError when SUBMITTED has no submitted attribution", () => {
			const props = { ...baseProps, status: "SUBMITTED" as const };

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it("includes the status and field names in the required-set error message", () => {
			const props = { ...baseProps, status: "SUBMITTED" as const };

			expect(() => WorkflowInstance.create(props)).toThrow(
				"status SUBMITTED requires submittedByUserId/submittedAt to be set",
			);
		});

		it("throws ValidationError when REVISION_REQUESTED has no submitted attribution", () => {
			const props = { ...baseProps, status: "REVISION_REQUESTED" as const };

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError when APPROVED has no approved attribution", () => {
			const props = {
				...baseProps,
				...validPropsForStatus("SUBMITTED"),
				status: "APPROVED" as const,
			};

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError when PUBLISHED has no validated attribution", () => {
			const props = {
				...baseProps,
				...validPropsForStatus("APPROVED"),
				status: "PUBLISHED" as const,
				publishedByUserId: "publisher-1",
				publishedAt: fixtureNow,
			};

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError when DRAFT has non-null attribution", () => {
			const props = {
				...baseProps,
				...validPropsForStatus("SUBMITTED"),
				status: "DRAFT" as const,
			};

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError when SUBMITTED has approved attribution set", () => {
			const props = {
				...baseProps,
				...validPropsForStatus("SUBMITTED"),
				approvedByUserId: "approver-1",
				approvedAt: fixtureNow,
			};

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError when REVISION_REQUESTED has approved attribution set", () => {
			const props = {
				...baseProps,
				...validPropsForStatus("REVISION_REQUESTED"),
				approvedByUserId: "approver-1",
				approvedAt: fixtureNow,
			};

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError when REVISION_REQUESTED has published attribution set", () => {
			const props = {
				...baseProps,
				...validPropsForStatus("REVISION_REQUESTED"),
				publishedByUserId: "publisher-1",
				publishedAt: fixtureNow,
			};

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it("throws ValidationError when APPROVED has published attribution set", () => {
			const props = {
				...baseProps,
				...validPropsForStatus("APPROVED"),
				publishedByUserId: "publisher-1",
				publishedAt: fixtureNow,
			};

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it("includes the status and field names in the required-null error message", () => {
			const props = {
				...baseProps,
				...validPropsForStatus("APPROVED"),
				publishedByUserId: "publisher-1",
				publishedAt: fixtureNow,
			};

			expect(() => WorkflowInstance.create(props)).toThrow(
				"status APPROVED requires publishedByUserId/publishedAt to be null",
			);
		});

		it("does not throw for a REJECTED instance with any status-consistent attribution combination", () => {
			const allNull = { ...baseProps, status: "REJECTED" as const };
			expect(() => WorkflowInstance.create(allNull)).not.toThrow();

			const someSet = {
				...baseProps,
				status: "REJECTED" as const,
				submittedByUserId: "user-1",
				submittedAt: fixtureNow,
				approvedByUserId: "approver-1",
				approvedAt: fixtureNow,
			};
			expect(() => WorkflowInstance.create(someSet)).not.toThrow();
		});

		it("still throws ValidationError for a REJECTED instance with a split attribution pair — pair consistency applies regardless of status", () => {
			const props: WorkflowInstanceProps = {
				...baseProps,
				status: "REJECTED",
				submittedByUserId: "user-1",
				submittedAt: null,
			};

			expect(() => WorkflowInstance.create(props)).toThrow(ValidationError);
		});

		it.each(STATUS_VALUES)(
			"accepts %s with its own valid attribution combination",
			(status) => {
				const props = { ...baseProps, ...validPropsForStatus(status) };

				expect(() => WorkflowInstance.create(props)).not.toThrow();
			},
		);
	});
});

describe("WorkflowInstance.submit()", () => {
	it("submits from DRAFT to SUBMITTED and stamps submission attribution", () => {
		const instance = WorkflowInstance.create(baseProps);
		const now = new Date("2024-03-01T00:00:00Z");

		const result = instance.submit({ userId: "user-1", now });

		expect(result.status).toBe("SUBMITTED");
		expect(result.submittedByUserId).toBe("user-1");
		expect(result.submittedAt).toEqual(now);
		expect(instance.status).toBe("DRAFT");
	});

	it("stamps updatedAt with the transition's own now", () => {
		const instance = WorkflowInstance.create(baseProps);
		const now = new Date("2024-03-01T00:00:00Z");

		const result = instance.submit({ userId: "user-1", now });

		expect(result.updatedAt).toEqual(now);
	});

	it("resubmits from REVISION_REQUESTED, overwriting prior submission attribution", () => {
		const instance = WorkflowInstance.create({
			...baseProps,
			status: "REVISION_REQUESTED",
			submittedByUserId: "user-old",
			submittedAt: new Date("2024-01-15T00:00:00Z"),
		});
		const laterDate = new Date("2024-03-01T00:00:00Z");

		const result = instance.submit({ userId: "user-2", now: laterDate });

		expect(result.status).toBe("SUBMITTED");
		expect(result.submittedByUserId).toBe("user-2");
		expect(result.submittedAt).toEqual(laterDate);
	});

	it("clears stale validator attribution when resubmitting from REVISION_REQUESTED", () => {
		const instance = WorkflowInstance.create({
			...baseProps,
			status: "REVISION_REQUESTED",
			submittedByUserId: "user-old",
			submittedAt: new Date("2024-01-15T00:00:00Z"),
			validatedByUserId: "validator-old",
			validatedAt: new Date("2024-01-20T00:00:00Z"),
		});

		const result = instance.submit({
			userId: "user-2",
			now: new Date("2024-03-01T00:00:00Z"),
		});

		expect(result.validatedByUserId).toBeNull();
		expect(result.validatedAt).toBeNull();
	});

	it("throws ConflictError when called from SUBMITTED", () => {
		const instance = WorkflowInstance.create({
			...baseProps,
			...validPropsForStatus("SUBMITTED"),
		});

		expect(() =>
			instance.submit({ userId: "user-1", now: new Date() }),
		).toThrow(ConflictError);
	});

	it("throws ConflictError with a message naming the transition and the current status", () => {
		const instance = WorkflowInstance.create({
			...baseProps,
			...validPropsForStatus("SUBMITTED"),
		});

		expect(() =>
			instance.submit({ userId: "user-1", now: new Date() }),
		).toThrow(/submit.*SUBMITTED/);
	});

	it("throws ConflictError carrying the entity/transition context", () => {
		const instance = WorkflowInstance.create({
			...baseProps,
			...validPropsForStatus("SUBMITTED"),
		});

		try {
			instance.submit({ userId: "user-1", now: new Date() });
			expect.unreachable("submit() should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(ConflictError);
			expect((error as ConflictError).context).toEqual({
				entityId: baseProps.entityId,
				entityType: baseProps.entityType,
				from: "SUBMITTED",
				attemptedTransition: "submit",
			});
		}
	});

	it.each(["APPROVED", "REJECTED", "PUBLISHED"] as const)(
		"throws ConflictError when called from %s",
		(status) => {
			const instance = WorkflowInstance.create({
				...baseProps,
				...validPropsForStatus(status),
			});

			expect(() =>
				instance.submit({ userId: "user-1", now: new Date() }),
			).toThrow(ConflictError);
		},
	);
});

describe("WorkflowInstance transition now validity (design.md Decision 5 addendum, round 4)", () => {
	it("throws ValidationError when now is an invalid Date", () => {
		const instance = WorkflowInstance.create(baseProps);

		expect(() =>
			instance.submit({ userId: "user-1", now: new Date("not-a-date") }),
		).toThrow(ValidationError);
	});

	it("includes the field name in the now validity error message", () => {
		const instance = WorkflowInstance.create(baseProps);

		expect(() =>
			instance.submit({ userId: "user-1", now: new Date("not-a-date") }),
		).toThrow("now must be a valid Date");
	});

	// Exercises the `instanceof Date` disjunct for `now` specifically (round 4 Gate 10 finding — only the NaN-time disjunct had been covered).
	it("throws ValidationError when now is not a Date instance at all", () => {
		const instance = WorkflowInstance.create(baseProps);

		expect(() =>
			instance.submit({
				userId: "user-1",
				now: "2024-01-01T00:00:00Z" as unknown as Date,
			}),
		).toThrow(ValidationError);
	});

	// Pins the ordering decision: an invalid `now` is malformed input, reported as
	// ValidationError, even when the current status would also fail the allowedFrom guard.
	it("throws ValidationError, not ConflictError, when now is invalid from a disallowed status", () => {
		const instance = WorkflowInstance.create({
			...baseProps,
			...validPropsForStatus("SUBMITTED"),
		});

		expect(() =>
			instance.submit({ userId: "user-1", now: new Date("not-a-date") }),
		).toThrow(ValidationError);
	});
});

describe("WorkflowInstance.validate()", () => {
	it("stamps validator attribution while SUBMITTED without changing status", () => {
		const instance = WorkflowInstance.create({
			...baseProps,
			...validPropsForStatus("SUBMITTED"),
		});
		const now = new Date("2024-03-02T00:00:00Z");

		const result = instance.validate({ userId: "validator-1", now });

		expect(result.status).toBe("SUBMITTED");
		expect(result.validatedByUserId).toBe("validator-1");
		expect(result.validatedAt).toEqual(now);
	});

	it("stamps updatedAt with the transition's own now", () => {
		const instance = WorkflowInstance.create({
			...baseProps,
			...validPropsForStatus("SUBMITTED"),
		});
		const now = new Date("2024-03-02T00:00:00Z");

		const result = instance.validate({ userId: "validator-1", now });

		expect(result.updatedAt).toEqual(now);
	});

	it.each(STATUS_VALUES.filter((status) => status !== "SUBMITTED"))(
		"throws ConflictError when called from %s",
		(status) => {
			const instance = WorkflowInstance.create({
				...baseProps,
				...validPropsForStatus(status),
			});

			expect(() =>
				instance.validate({ userId: "validator-1", now: new Date() }),
			).toThrow(ConflictError);
		},
	);
});

describe("WorkflowInstance.approve()", () => {
	it("approves from SUBMITTED to APPROVED and stamps approval attribution", () => {
		const instance = WorkflowInstance.create({
			...baseProps,
			...validPropsForStatus("SUBMITTED"),
		});
		const now = new Date("2024-03-03T00:00:00Z");

		const result = instance.approve({ userId: "approver-1", now });

		expect(result.status).toBe("APPROVED");
		expect(result.approvedByUserId).toBe("approver-1");
		expect(result.approvedAt).toEqual(now);
	});

	it("stamps updatedAt with the transition's own now", () => {
		const instance = WorkflowInstance.create({
			...baseProps,
			...validPropsForStatus("SUBMITTED"),
		});
		const now = new Date("2024-03-03T00:00:00Z");

		const result = instance.approve({ userId: "approver-1", now });

		expect(result.updatedAt).toEqual(now);
	});

	it.each(STATUS_VALUES.filter((status) => status !== "SUBMITTED"))(
		"throws ConflictError when called from %s",
		(status) => {
			const instance = WorkflowInstance.create({
				...baseProps,
				...validPropsForStatus(status),
			});

			expect(() =>
				instance.approve({ userId: "approver-1", now: new Date() }),
			).toThrow(ConflictError);
		},
	);
});

describe("WorkflowInstance.requestRevision()", () => {
	it("moves SUBMITTED to REVISION_REQUESTED without writing any attribution field", () => {
		const submittedAt = new Date("2024-02-15T00:00:00Z");
		const instance = WorkflowInstance.create({
			...baseProps,
			status: "SUBMITTED",
			submittedByUserId: "user-1",
			submittedAt,
		});

		const result = instance.requestRevision({
			userId: "reviewer-1",
			now: new Date(),
		});

		expect(result.status).toBe("REVISION_REQUESTED");
		expect(result.submittedByUserId).toBe("user-1");
		expect(result.submittedAt).toEqual(submittedAt);
		expect(result.validatedByUserId).toBeNull();
		expect(result.validatedAt).toBeNull();
		expect(result.approvedByUserId).toBeNull();
		expect(result.approvedAt).toBeNull();
		expect(result.publishedByUserId).toBeNull();
		expect(result.publishedAt).toBeNull();
	});

	it("stamps updatedAt with the transition's own now", () => {
		const instance = WorkflowInstance.create({
			...baseProps,
			...validPropsForStatus("SUBMITTED"),
		});
		const now = new Date("2024-03-04T00:00:00Z");

		const result = instance.requestRevision({ userId: "reviewer-1", now });

		expect(result.updatedAt).toEqual(now);
	});

	it.each(STATUS_VALUES.filter((status) => status !== "SUBMITTED"))(
		"throws ConflictError when called from %s",
		(status) => {
			const instance = WorkflowInstance.create({
				...baseProps,
				...validPropsForStatus(status),
			});

			expect(() =>
				instance.requestRevision({ userId: "reviewer-1", now: new Date() }),
			).toThrow(ConflictError);
		},
	);
});

describe("WorkflowInstance.publish()", () => {
	it("direct publish backfills validator attribution from the publisher when both are null", () => {
		const instance = WorkflowInstance.create({
			...baseProps,
			...validPropsForStatus("APPROVED"),
		});
		const now = new Date("2024-04-01T00:00:00Z");

		const result = instance.publish({ userId: "publisher-1", now });

		expect(result.status).toBe("PUBLISHED");
		expect(result.publishedByUserId).toBe("publisher-1");
		expect(result.publishedAt).toEqual(now);
		expect(result.validatedByUserId).toBe("publisher-1");
		expect(result.validatedAt).toEqual(now);
	});

	it("stamps updatedAt with the transition's own now", () => {
		const instance = WorkflowInstance.create({
			...baseProps,
			...validPropsForStatus("APPROVED"),
		});
		const now = new Date("2024-04-01T00:00:00Z");

		const result = instance.publish({ userId: "publisher-1", now });

		expect(result.updatedAt).toEqual(now);
	});

	it("publish after a separate validate() preserves the existing validator attribution", () => {
		const earlierDate = new Date("2024-03-15T00:00:00Z");
		const instance = WorkflowInstance.create({
			...baseProps,
			...validPropsForStatus("APPROVED"),
			validatedByUserId: "validator-1",
			validatedAt: earlierDate,
		});
		const laterDate = new Date("2024-04-01T00:00:00Z");

		const result = instance.publish({ userId: "publisher-2", now: laterDate });

		expect(result.status).toBe("PUBLISHED");
		expect(result.publishedByUserId).toBe("publisher-2");
		expect(result.publishedAt).toEqual(laterDate);
		expect(result.validatedByUserId).toBe("validator-1");
		expect(result.validatedAt).toEqual(earlierDate);
	});

	it.each(STATUS_VALUES.filter((status) => status !== "APPROVED"))(
		"throws ConflictError when called from %s",
		(status) => {
			const instance = WorkflowInstance.create({
				...baseProps,
				...validPropsForStatus(status),
			});

			expect(() =>
				instance.publish({ userId: "publisher-1", now: new Date() }),
			).toThrow(ConflictError);
		},
	);
});

describe("WorkflowInstance transition purity", () => {
	it("leaves the original instance unchanged after a successful submit()", () => {
		const instance = WorkflowInstance.create(baseProps);

		instance.submit({
			userId: "user-1",
			now: new Date("2024-05-01T00:00:00Z"),
		});

		expect(instance.status).toBe("DRAFT");
		expect(instance.submittedByUserId).toBeNull();
		expect(instance.submittedAt).toBeNull();
	});

	it("produces independent results from two separate transitions off the same source instance", () => {
		const instance = WorkflowInstance.create({
			...baseProps,
			...validPropsForStatus("SUBMITTED"),
		});
		const d1 = new Date("2024-05-01T00:00:00Z");
		const d2 = new Date("2024-05-02T00:00:00Z");

		const approved = instance.approve({ userId: "a", now: d1 });
		const revisionRequested = instance.requestRevision({
			userId: "b",
			now: d2,
		});

		expect(approved).not.toBe(revisionRequested);
		expect(approved.status).toBe("APPROVED");
		expect(revisionRequested.status).toBe("REVISION_REQUESTED");
		expect(instance.status).toBe("SUBMITTED");
	});
});
