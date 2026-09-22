import { ConflictError, ValidationError } from "~/shared/errors";

/** Field set mirrors the three real Phase 2 tables (parent + geom + division child tables — design.md Context);
 * supersedes `IHazardousEventRepository.ts`'s provisional `SpatialObservationRecord`. */
export interface SpatialObservationProps {
	readonly id: string;
	readonly hazardousEventId: string;
	readonly observationTime: Date;
	/** No runtime guard — a descriptive field, not identity/reference, matching HazardousEvent.ts's
	 * convention of leaving descriptive strings (e.g. description, dataSource) unvalidated. */
	readonly note: string | null;
	/** Untyped PostGIS geometry — no typed shape without a PostGIS TS library, matching the table's own `$type<unknown>()` (design.md Context). */
	readonly geometries: readonly unknown[];
	readonly divisionIds: readonly string[];
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/** True when `value` isn't a valid Date instant (non-Date, or NaN-time). Redefined locally to keep each entity file independently auditable. */
function isInvalidDate(value: unknown): boolean {
	return !(value instanceof Date) || Number.isNaN(value.getTime());
}

/** Defends the immutability guarantee against a caller mutating a returned/passed-in Date in place (matches HazardousEvent.ts's own precedent). */
function cloneDate(date: Date): Date {
	return new Date(date.getTime());
}

/** Models one dated geom/division reading for a `HazardousEvent` (`hazardous_event_spatial_observation` +
 * its `_geom`/`_division` children) — a genuine child entity with identity, not a stateless domain service like `CausalChain.ts` (design.md Context). */
export class SpatialObservation {
	private readonly props: SpatialObservationProps;

	private constructor(props: SpatialObservationProps) {
		this.props = {
			...props,
			observationTime: cloneDate(props.observationTime),
			geometries: [...props.geometries],
			divisionIds: [...props.divisionIds],
			createdAt: cloneDate(props.createdAt),
			updatedAt: cloneDate(props.updatedAt),
		};
	}

	/**
	 * `validDivisionIds` is mandatory, not optional/defaulted — closes DEF-005 by construction: no caller can build a
	 * `SpatialObservation` without supplying a tenant-scoped set, even an empty one (design.md Decision 4).
	 *
	 * @throws {ValidationError} for an invalid observationTime/createdAt/updatedAt, a non-array geometries/divisionIds,
	 * an empty/whitespace-only/non-string id/hazardousEventId, a repeated divisionIds entry, or a divisionId absent from validDivisionIds.
	 */
	static create(
		props: SpatialObservationProps,
		validDivisionIds: ReadonlySet<string>,
	): SpatialObservation {
		// Date guards run first so an invalid Date is never misreported as a missing-field error (design.md Decision 2).
		for (const field of [
			"observationTime",
			"createdAt",
			"updatedAt",
		] as const) {
			if (isInvalidDate(props[field])) {
				throw new ValidationError(`${field} must be a valid Date`);
			}
		}

		// Array.isArray, a bare string is iterable but not an array and would otherwise be silently spread into characters
		// instead of rejected — extends the date guards' "never a raw TypeError" principle to these two array props.
		for (const field of ["geometries", "divisionIds"] as const) {
			if (!Array.isArray(props[field])) {
				throw new ValidationError(`${field} must be an array`);
			}
		}

		for (const field of ["id", "hazardousEventId"] as const) {
			// typeof guard, not just == null: a non-string value has no .trim() (mirrors HazardousEvent.ts Decision 10).
			const value = props[field];
			if (typeof value !== "string" || value.trim().length === 0) {
				throw new ValidationError(`${field} must not be empty`);
			}
		}

		// Domain-layer mirror of the DB's own unique(observation_id, division_id) constraint; checked before
		// tenant-membership below since a duplicate is a shape problem, independent of which ids are valid for this tenant (design.md Decision 3).
		if (new Set(props.divisionIds).size !== props.divisionIds.length) {
			throw new ValidationError(
				"divisionIds must not contain duplicate values",
			);
		}

		for (const divisionId of props.divisionIds) {
			if (!validDivisionIds.has(divisionId)) {
				throw new ValidationError(
					`divisionId ${divisionId} is not present in validDivisionIds`,
				);
			}
		}

		return new SpatialObservation(props);
	}

	get id(): string {
		return this.props.id;
	}

	get hazardousEventId(): string {
		return this.props.hazardousEventId;
	}

	get observationTime(): Date {
		return cloneDate(this.props.observationTime);
	}

	get note(): string | null {
		return this.props.note;
	}

	get geometries(): readonly unknown[] {
		return [...this.props.geometries];
	}

	get divisionIds(): readonly string[] {
		return [...this.props.divisionIds];
	}

	get createdAt(): Date {
		return cloneDate(this.props.createdAt);
	}

	get updatedAt(): Date {
		return cloneDate(this.props.updatedAt);
	}

	/** Latest-by-`observationTime` selection, independent of array order; keeps the first-seen entry on an exact tie
	 * (strict `>` never replaces `current`). A tie should never occur in practice (the DB's `unique(hazardous_event_id, observation_time)`
	 * constraint and the `assertNoConflictingObservationTime` conflict check, both prevent it), but this must still resolve deterministically
	 * for a defensively-merged input (design.md Decision 5). */
	static selectCurrent(
		observations: readonly SpatialObservation[],
	): SpatialObservation | null {
		if (observations.length === 0) {
			return null;
		}

		let current = observations[0];
		for (let i = 1; i < observations.length; i++) {
			const candidate = observations[i];
			if (
				candidate.observationTime.getTime() > current.observationTime.getTime()
			) {
				current = candidate;
			}
		}
		return current;
	}

	/**
	 * `ConflictError` (409), not `ValidationError` (422) — `existingAtSameTime` is already valid; rejecting it is state-dependent,
	 * the same shape `WorkflowInstance.transition()` established `ConflictError` for in this codebase (design.md Decision 6).
	 *
	 * @throws {ConflictError} when existingAtSameTime is non-null and confirmReplace is false.
	 */
	static assertNoConflictingObservationTime(
		existingAtSameTime: SpatialObservation | null,
		confirmReplace: boolean,
	): void {
		if (existingAtSameTime === null || confirmReplace) {
			return;
		}

		// Read once: the observationTime getter clones on every call (cloneDate).
		const { hazardousEventId, observationTime } = existingAtSameTime;
		throw new ConflictError(
			`An observation already exists for hazardousEventId ${hazardousEventId} ` +
				`at observationTime ${observationTime.toISOString()}; pass confirmReplace to replace it`,
			{ hazardousEventId, observationTime, confirmReplace },
		);
	}
}
