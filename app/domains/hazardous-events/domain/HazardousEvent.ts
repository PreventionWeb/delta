import { ValidationError } from "~/shared/errors";

/** DB enum on `hazardous_event.hazardous_event_status` — physical/temporal classification, distinct from approval status (design.md Context, DEF-009's surviving leg). */
export type HazardousEventStatus = "forecasted" | "ongoing" | "passed";

/** Full set of retained persisted fields, using domain names — excludes approval-status and HIP-hierarchy fields entirely (design.md Context; spec: "carries no approval-status or HIP-hierarchy field"). */
export interface HazardousEventProps {
	readonly id: string;
	readonly tenantId: string;
	readonly specificHazardId: string;
	/** `zeroText()` column (`text`, not `timestamp`) — date-like text, not a real Date (design.md Context). */
	readonly startDate: string;
	readonly endDate: string;
	readonly nationalSpecification: string;
	readonly description: string;
	readonly chainsExplanation: string;
	/** DB column name is `magniture` (pre-existing typo) — the domain prop stays `magnitude`, not "fixed" here (design.md Context). */
	readonly magnitude: string;
	readonly recordOriginator: string;
	readonly dataSource: string;
	readonly hazardousEventStatus: HazardousEventStatus | null;
	/** Plain nullable text, not normalized — "unpopulated" must stay distinguishable from "" (schema's own comment, design.md Context). */
	readonly specificHazardLocalName: string | null;
	readonly specificHazardNationalName: string | null;
	readonly apiImportId: string | null;
	readonly createdByUserId: string | null;
	readonly updatedByUserId: string | null;
	readonly submittedByUserId: string | null;
	readonly submittedAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date | null;
}

/** "" or null/undefined -> null for attribution fields (design.md Decision 4 — absent attribution is a normal state, unlike the three required fields; Gate 10 finding added the null/undefined case). */
function normalizeAttribution(value: string | null): string | null {
	return value == null || value === "" ? null : value;
}

/** True when `value` isn't a valid Date instant (non-Date, or NaN-time). Mirrors WorkflowInstance.ts's own predicate, redefined locally to avoid a cross-bounded-context import (design.md Decision 9). */
function isInvalidDate(value: unknown): boolean {
	return !(value instanceof Date) || Number.isNaN(value.getTime());
}

/** Defends the immutability guarantee against a caller mutating a returned Date in place (matches WorkflowInstance's own precedent). */
function cloneDate(date: Date | null): Date | null {
	return date === null ? null : new Date(date.getTime());
}

/** Same as cloneDate, for `createdAt` — the one Date field that is never null. */
function cloneRequiredDate(date: Date): Date {
	return new Date(date.getTime());
}

/** Models `hazardous_event`'s core aggregate data. No state machine of its own — lifecycle events (submit/validate/approve/publish) belong to `WorkflowInstance` (design.md Decision 1). */
export class HazardousEvent {
	private readonly props: HazardousEventProps;

	private constructor(props: HazardousEventProps) {
		this.props = {
			...props,
			submittedAt: cloneDate(props.submittedAt),
			createdAt: cloneRequiredDate(props.createdAt),
			updatedAt: cloneDate(props.updatedAt),
		};
	}

	/**
	 * @throws {ValidationError} for an empty, whitespace-only, or non-string tenantId/specificHazardId/startDate
	 *   (Decision 2/10), an invalid createdAt/updatedAt/submittedAt (Decision 9), a present but non-string
	 *   endDate (Decision 11), or startDate later than endDate (Decision 3).
	 */
	static create(props: HazardousEventProps): HazardousEvent {
		for (const field of [
			"tenantId",
			"specificHazardId",
			"startDate",
		] as const) {
			// typeof guard, not just == null: a non-string value has no .trim() (design.md Decision 10).
			const value = props[field];
			if (typeof value !== "string" || value.trim().length === 0) {
				throw new ValidationError(`${field} must not be empty`);
			}
		}

		// Checked before startDate/endDate ordering, so an invalid Date is never misreported as an ordering error (design.md Decision 9).
		if (isInvalidDate(props.createdAt)) {
			throw new ValidationError("createdAt must be a valid Date");
		}
		if (props.updatedAt !== null && isInvalidDate(props.updatedAt)) {
			throw new ValidationError("updatedAt must be a valid Date");
		}
		if (props.submittedAt !== null && isInvalidDate(props.submittedAt)) {
			throw new ValidationError("submittedAt must be a valid Date");
		}

		// endDate is optional, so null/undefined is exempted before this typeof check runs (design.md Decision 11).
		if (props.endDate != null && typeof props.endDate !== "string") {
			throw new ValidationError("endDate must be a string");
		}
		// endDate is optional: null/undefined or whitespace-only means "not set", not a real date to compare (Gate 10 finding).
		if (
			props.endDate != null &&
			props.endDate.trim().length > 0 &&
			props.startDate > props.endDate
		) {
			throw new ValidationError("startDate must not be later than endDate");
		}

		return new HazardousEvent({
			...props,
			createdByUserId: normalizeAttribution(props.createdByUserId),
			updatedByUserId: normalizeAttribution(props.updatedByUserId),
			submittedByUserId: normalizeAttribution(props.submittedByUserId),
		});
	}

	get id(): string {
		return this.props.id;
	}

	get tenantId(): string {
		return this.props.tenantId;
	}

	get specificHazardId(): string {
		return this.props.specificHazardId;
	}

	get startDate(): string {
		return this.props.startDate;
	}

	get endDate(): string {
		return this.props.endDate;
	}

	get nationalSpecification(): string {
		return this.props.nationalSpecification;
	}

	get description(): string {
		return this.props.description;
	}

	get chainsExplanation(): string {
		return this.props.chainsExplanation;
	}

	get magnitude(): string {
		return this.props.magnitude;
	}

	get recordOriginator(): string {
		return this.props.recordOriginator;
	}

	get dataSource(): string {
		return this.props.dataSource;
	}

	get hazardousEventStatus(): HazardousEventStatus | null {
		return this.props.hazardousEventStatus;
	}

	get specificHazardLocalName(): string | null {
		return this.props.specificHazardLocalName;
	}

	get specificHazardNationalName(): string | null {
		return this.props.specificHazardNationalName;
	}

	get apiImportId(): string | null {
		return this.props.apiImportId;
	}

	get createdByUserId(): string | null {
		return this.props.createdByUserId;
	}

	get updatedByUserId(): string | null {
		return this.props.updatedByUserId;
	}

	get submittedByUserId(): string | null {
		return this.props.submittedByUserId;
	}

	get submittedAt(): Date | null {
		return cloneDate(this.props.submittedAt);
	}

	get createdAt(): Date {
		return cloneRequiredDate(this.props.createdAt);
	}

	get updatedAt(): Date | null {
		return cloneDate(this.props.updatedAt);
	}
}
