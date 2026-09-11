import { ConflictError, ValidationError } from "~/shared/errors";

/** Canonical definition — infrastructure (workflowInstanceTable.ts, workflowHistoryTable.ts) imports this; the dependency runs one way only (design.md Decision 9 round 6). */
export const ENTITY_TYPE_VALUES = ["HE", "DE", "DR"] as const;
export type EntityType = (typeof ENTITY_TYPE_VALUES)[number];

/** Canonical definition — infrastructure imports this; the dependency runs one way only (design.md Decision 9 round 6). */
export const STATUS_VALUES = [
	"DRAFT",
	"SUBMITTED",
	"REVISION_REQUESTED",
	"APPROVED",
	"REJECTED",
	"PUBLISHED",
] as const;
export type Status = (typeof STATUS_VALUES)[number];

/** Full set of persisted fields for a WorkflowInstance, using domain names. */
export interface WorkflowInstanceProps {
	readonly id: string;
	/** Polymorphic key, no FK (schema design.md Decision 1). */
	readonly entityId: string;
	readonly entityType: EntityType;
	readonly status: Status;
	readonly submittedByUserId: string | null;
	readonly submittedAt: Date | null;
	readonly validatedByUserId: string | null;
	readonly validatedAt: Date | null;
	readonly approvedByUserId: string | null;
	readonly approvedAt: Date | null;
	readonly publishedByUserId: string | null;
	readonly publishedAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/** Explicit clock/actor — never read internally, so transitions stay pure (design.md Decision 5). */
export interface TransitionParams {
	userId: string;
	now: Date;
}

type PairName = "submitted" | "validated" | "approved" | "published";
const PAIR_NAMES: readonly PairName[] = [
	"submitted",
	"validated",
	"approved",
	"published",
];

function pairFields(
	props: WorkflowInstanceProps,
	name: PairName,
): readonly [string | null, Date | null] {
	switch (name) {
		case "submitted":
			return [props.submittedByUserId, props.submittedAt];
		case "validated":
			return [props.validatedByUserId, props.validatedAt];
		case "approved":
			return [props.approvedByUserId, props.approvedAt];
		case "published":
			return [props.publishedByUserId, props.publishedAt];
	}
}

/** Status → attribution pairs required set/null (design.md Decision 7). REJECTED is unvalidated below — no transition targets it yet (Decision 4). */
const REQUIRED_SET: Record<Status, readonly PairName[]> = {
	DRAFT: [],
	SUBMITTED: ["submitted"],
	REVISION_REQUESTED: ["submitted"],
	APPROVED: ["submitted", "approved"],
	REJECTED: [],
	PUBLISHED: ["submitted", "validated", "approved", "published"],
};

const REQUIRED_NULL: Record<Status, readonly PairName[]> = {
	DRAFT: ["submitted", "validated", "approved", "published"],
	SUBMITTED: ["approved", "published"],
	REVISION_REQUESTED: ["approved", "published"],
	APPROVED: ["published"],
	REJECTED: [],
	PUBLISHED: [],
};

/** True when `value` isn't a real Date instant: `instanceof` catches a non-Date value (e.g. a bad DB row), NaN-time catches a syntactically-real-but-invalid Date (e.g. `new Date("garbage")`). Shared by create()'s createdAt/updatedAt/attribution checks and transition()'s now check (design.md Decision 9/round 4). Takes `unknown`, not `Date`, so the `instanceof` disjunct can't later be "simplified away" as unreachable — every call site's static type already claims `Date`, which is exactly the claim this guard exists to distrust (round 4 Gate 10 finding). */
function isInvalidDate(value: unknown): boolean {
	return !(value instanceof Date) || Number.isNaN(value.getTime());
}

/** Defends the immutability guarantee (design.md Decision 2) against a caller mutating a returned Date in place. */
function cloneDate(date: Date | null): Date | null {
	return date === null ? null : new Date(date.getTime());
}

/** Same as cloneDate, for the two fields (createdAt/updatedAt) that are never null. */
function cloneRequiredDate(date: Date): Date {
	return new Date(date.getTime());
}

/** Construct only via `create()` — enforces valid `entityType`/`status` and cross-field consistency before the instance exists. */
export class WorkflowInstance {
	private readonly props: WorkflowInstanceProps;

	/** Clones every incoming Date field so a caller mutating a Date after passing it in (or reusing a shared `now` across calls) can't corrupt already-constructed state. Assumes every Date-typed field — createdAt/updatedAt, the four attribution *At fields, and (via transition()) now — is already valid; enforced by create()/transition(), not re-checked here (design.md Decision 2, round 4 note). */
	private constructor(props: WorkflowInstanceProps) {
		this.props = {
			...props,
			submittedAt: cloneDate(props.submittedAt),
			validatedAt: cloneDate(props.validatedAt),
			approvedAt: cloneDate(props.approvedAt),
			publishedAt: cloneDate(props.publishedAt),
			createdAt: cloneRequiredDate(props.createdAt),
			updatedAt: cloneRequiredDate(props.updatedAt),
		};
	}

	/** @throws {ValidationError} for an invalid enum, a split attribution pair, or a pair missing/present that the given status requires (design.md Decision 7). */
	static create(props: WorkflowInstanceProps): WorkflowInstance {
		if (!ENTITY_TYPE_VALUES.includes(props.entityType)) {
			throw new ValidationError(
				`entityType must be one of ${ENTITY_TYPE_VALUES.join(", ")}`,
			);
		}

		if (!STATUS_VALUES.includes(props.status)) {
			throw new ValidationError(
				`status must be one of ${STATUS_VALUES.join(", ")}`,
			);
		}

		if (isInvalidDate(props.createdAt)) {
			throw new ValidationError("createdAt must be a valid Date");
		}

		if (isInvalidDate(props.updatedAt)) {
			throw new ValidationError("updatedAt must be a valid Date");
		}

		// Attribution *At fields are nullable — only check validity when set (design.md Decision 9 expanded scope, round 4).
		// Kept as its own loop, before pair-consistency, so an invalid Date is always reported as a Date error, not a pair-split error.
		for (const name of PAIR_NAMES) {
			const [, at] = pairFields(props, name);
			if (at !== null && isInvalidDate(at)) {
				throw new ValidationError(`${name}At must be a valid Date`);
			}
		}

		for (const name of PAIR_NAMES) {
			const [byUserId, at] = pairFields(props, name);
			if ((byUserId === null) !== (at === null)) {
				throw new ValidationError(
					`${name}ByUserId and ${name}At must be both null or both set`,
				);
			}
		}

		// REJECTED has no transition method yet, so its real invariant isn't known — deliberately unvalidated (Decision 4).
		if (props.status !== "REJECTED") {
			for (const name of REQUIRED_SET[props.status]) {
				if (pairFields(props, name)[0] === null) {
					throw new ValidationError(
						`status ${props.status} requires ${name}ByUserId/${name}At to be set`,
					);
				}
			}

			for (const name of REQUIRED_NULL[props.status]) {
				if (pairFields(props, name)[0] !== null) {
					throw new ValidationError(
						`status ${props.status} requires ${name}ByUserId/${name}At to be null`,
					);
				}
			}
		}

		return new WorkflowInstance(props);
	}

	/** Skips create()'s enum/cross-field checks by design (already validated, immutable post-construction), but does validate the caller-supplied `now` — ValidationError there outranks a ConflictError from the allowedFrom guard (design.md Decision 5). */
	private transition(
		allowedFrom: readonly Status[],
		attemptedTransition:
			| "submit"
			| "validate"
			| "approve"
			| "requestRevision"
			| "publish",
		now: Date,
		patch: Partial<WorkflowInstanceProps>,
	): WorkflowInstance {
		if (isInvalidDate(now)) {
			throw new ValidationError("now must be a valid Date");
		}

		if (!allowedFrom.includes(this.props.status)) {
			throw new ConflictError(
				`Cannot ${attemptedTransition} a WorkflowInstance from status ${this.props.status}`,
				{
					entityId: this.props.entityId,
					entityType: this.props.entityType,
					from: this.props.status,
					attemptedTransition,
				},
			);
		}

		return new WorkflowInstance({ ...this.props, ...patch });
	}

	/** @throws {ConflictError} unless current status is DRAFT or REVISION_REQUESTED. Clears any stale validator attribution from a prior revision cycle — matches today's live hazardousEventUpdateApprovalStatusNeedRevision behavior. */
	submit({ userId, now }: TransitionParams): WorkflowInstance {
		return this.transition(["DRAFT", "REVISION_REQUESTED"], "submit", now, {
			status: "SUBMITTED",
			submittedByUserId: userId,
			submittedAt: now,
			validatedByUserId: null,
			validatedAt: null,
			updatedAt: now,
		});
	}

	/** @throws {ConflictError} unless current status is SUBMITTED. */
	validate({ userId, now }: TransitionParams): WorkflowInstance {
		return this.transition(["SUBMITTED"], "validate", now, {
			validatedByUserId: userId,
			validatedAt: now,
			updatedAt: now,
		});
	}

	/** No reject() counterpart — REJECTED is out of scope (design.md Decision 4). */
	approve({ userId, now }: TransitionParams): WorkflowInstance {
		return this.transition(["SUBMITTED"], "approve", now, {
			status: "APPROVED",
			approvedByUserId: userId,
			approvedAt: now,
			updatedAt: now,
		});
	}

	/** No attribution column exists for this event (design.md Decision 1); userId is unused by design. */
	requestRevision({ now }: TransitionParams): WorkflowInstance {
		return this.transition(["SUBMITTED"], "requestRevision", now, {
			status: "REVISION_REQUESTED",
			updatedAt: now,
		});
	}

	/** Backfills validatedBy/At from the publisher only if unset — never overwrites a real validator (0c fix, open decision #9). */
	publish({ userId, now }: TransitionParams): WorkflowInstance {
		const validatorAlreadySet =
			this.props.validatedByUserId !== null || this.props.validatedAt !== null;

		return this.transition(["APPROVED"], "publish", now, {
			status: "PUBLISHED",
			publishedByUserId: userId,
			publishedAt: now,
			updatedAt: now,
			...(validatorAlreadySet
				? {}
				: { validatedByUserId: userId, validatedAt: now }),
		});
	}

	get id(): string {
		return this.props.id;
	}

	get entityId(): string {
		return this.props.entityId;
	}

	get entityType(): EntityType {
		return this.props.entityType;
	}

	get status(): Status {
		return this.props.status;
	}

	get submittedByUserId(): string | null {
		return this.props.submittedByUserId;
	}

	get submittedAt(): Date | null {
		return cloneDate(this.props.submittedAt);
	}

	get validatedByUserId(): string | null {
		return this.props.validatedByUserId;
	}

	get validatedAt(): Date | null {
		return cloneDate(this.props.validatedAt);
	}

	get approvedByUserId(): string | null {
		return this.props.approvedByUserId;
	}

	get approvedAt(): Date | null {
		return cloneDate(this.props.approvedAt);
	}

	get publishedByUserId(): string | null {
		return this.props.publishedByUserId;
	}

	get publishedAt(): Date | null {
		return cloneDate(this.props.publishedAt);
	}

	get createdAt(): Date {
		return cloneRequiredDate(this.props.createdAt);
	}

	get updatedAt(): Date {
		return cloneRequiredDate(this.props.updatedAt);
	}
}
