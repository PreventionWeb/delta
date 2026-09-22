import { ValidationError } from "~/shared/errors";

/** DB enum on `hazardous_event.hazardous_event_status` — physical/temporal classification, distinct from approval status (design.md Context, DEF-009's surviving leg). */
export type HazardousEventStatus = "forecasted" | "ongoing" | "passed";

/** Full set of retained persisted fields, using domain names — excludes approval-status and HIP-hierarchy fields entirely (design.md Context; spec: "carries no approval-status or HIP-hierarchy field"). */
export interface HazardousEventProps {
	readonly id: string;
	readonly tenantId: string;
	readonly specificHazardId: string;
	/** `zeroText()` column (`text`, not `timestamp`) — date-like text, not a real Date. */
	readonly startDate: string;
	readonly endDate: string;
	readonly nationalSpecification: string;
	readonly description: string;
	readonly chainsExplanation: string;
	/** DB column name is `magniture` (pre-existing typo) — the domain prop stays `magnitude`, not "fixed" here. */
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
	/** Mirrors `hazardous_event_hazard_driver`'s join row — a bare id collection, same pattern as `SpatialObservation.ts`'s `divisionIds` (design.md Decision 2). */
	readonly hazardDriverIds: readonly string[];
	readonly attachments: readonly HazardousEventAttachmentProps[];
	readonly fieldValues: readonly HazardousEventFieldValueProps[];
	/** Same shape as `fieldValues`, FK to a distinct, tenant-scoped table — kept as a genuinely separate collection (design.md Decision 3). */
	readonly customFieldValues: readonly HazardousEventCustomFieldValueProps[];
}

/** One `hazardous_event_attachment` row. `id` is typed but not validated (design.md Decision 2 — matches `HazardousEvent.id`'s own existing treatment). */
export interface HazardousEventAttachmentProps {
	readonly id: string;
	readonly title: string;
	readonly fileKey: string;
	readonly fileName: string;
	readonly fileType: string;
	readonly fileSize: number;
}

/** One `hazardous_event_field_value` row. No `id` — `hazardTypeFieldDefinitionId` is the natural, validated discriminator within the collection (design.md Decision 2). */
export interface HazardousEventFieldValueProps {
	readonly hazardTypeFieldDefinitionId: string;
	readonly value: string;
}

/** One `hazardous_event_custom_field_value` row — same shape as `HazardousEventFieldValueProps`, distinct FK target (design.md Decision 2). */
export interface HazardousEventCustomFieldValueProps {
	readonly hazardTypeCustomFieldDefinitionId: string;
	readonly value: string;
}

/** "" or null/undefined -> null for attribution fields (design.md Decision 4 — absent attribution is a normal state, unlike the three required fields). */
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

/** A non-array must never reach a per-item loop or duplicate check — it could iterate as characters or throw a raw TypeError (design.md Decision 6). */
function assertIsArray(value: unknown, fieldName: string): void {
	if (!Array.isArray(value)) {
		throw new ValidationError(`${fieldName} must be an array`);
	}
}

/** Same required-string-field rule as the top-level tenantId/specificHazardId/startDate check (Decision 10), reused per collection item. */
function assertNonEmptyString(value: unknown, fieldName: string): void {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new ValidationError(`${fieldName} must not be empty`);
	}
}

/** A null/undefined/primitive array element must never reach a property access, one level deeper
 * than assertIsArray's own guard (design.md Decision 6 addendum). Crash-prevention only: an array
 * or boxed primitive still passes (`typeof === "object"`) and is rejected by the per-field checks
 * that follow instead, via its missing/undefined properties. */
function assertIsObject(value: unknown, collectionName: string): void {
	if (typeof value !== "object" || value === null) {
		throw new ValidationError(
			`${collectionName} must not contain a null, undefined, or non-object element`,
		);
	}
}

/** Mirrors a collection's own DB-level `UNIQUE(hazardousEventId, <key>)` constraint at the domain layer (Invariant 3, design.md Decision 3). */
function assertNoDuplicates(
	keys: readonly string[],
	collectionName: string,
	keyName: string,
): void {
	if (new Set(keys).size !== keys.length) {
		throw new ValidationError(
			`${collectionName} must not contain duplicate ${keyName} values`,
		);
	}
}

/** Closes DEF-021's shape by construction — every id must belong to the caller-supplied, tenant-scoped valid-id set (design.md Decision 4). */
function assertMembership(
	keys: readonly string[],
	validKeys: ReadonlySet<string>,
	keyLabel: string,
	setName: string,
): void {
	for (const key of keys) {
		if (!validKeys.has(key)) {
			throw new ValidationError(
				`${keyLabel} ${key} is not present in ${setName}`,
			);
		}
	}
}

/** Mirrors `hazardous_event_hazard_driver`'s `UNIQUE(hazardousEventId, hazardDriverId)` constraint and closes DEF-021's shape (design.md Decisions 3/4). */
function validateHazardDriverIds(
	hazardDriverIds: readonly string[],
	validHazardDriverIds: ReadonlySet<string>,
): void {
	assertIsArray(hazardDriverIds, "hazardDriverIds");
	for (const hazardDriverId of hazardDriverIds) {
		assertNonEmptyString(hazardDriverId, "hazardDriverIds");
	}
	assertNoDuplicates(hazardDriverIds, "hazardDriverIds", "hazardDriverId");
	assertMembership(
		hazardDriverIds,
		validHazardDriverIds,
		"hazardDriverId",
		"validHazardDriverIds",
	);
}

/** No duplicate-value check: `hazardous_event_attachment` has no uniqueness constraint beyond its PK (design.md Decision 3). */
function validateAttachments(
	attachments: readonly HazardousEventAttachmentProps[],
): void {
	assertIsArray(attachments, "attachments");
	for (const attachment of attachments) {
		assertIsObject(attachment, "attachments");
		for (const field of ["title", "fileKey", "fileName", "fileType"] as const) {
			assertNonEmptyString(attachment[field], field);
		}
		// bigint("file_size", { mode: "number" }).notNull() -> finite integer; no positivity check, no CHECK constraint to mirror (design.md Decision 5).
		const { fileSize } = attachment;
		if (
			typeof fileSize !== "number" ||
			!Number.isFinite(fileSize) ||
			!Number.isInteger(fileSize)
		) {
			throw new ValidationError("fileSize must be a finite integer number");
		}
	}
}

/** Mirrors `hazardous_event_field_value`'s `UNIQUE(hazardousEventId, hazardTypeFieldDefinitionId)`
 * constraint. No membership check — `hazardTypeFieldDefinitionTable` has no `countryAccountsId`
 * (global reference data, design.md Decision 4). */
function validateFieldValues(
	fieldValues: readonly HazardousEventFieldValueProps[],
): void {
	assertIsArray(fieldValues, "fieldValues");
	for (const fieldValue of fieldValues) {
		assertIsObject(fieldValue, "fieldValues");
		assertNonEmptyString(
			fieldValue.hazardTypeFieldDefinitionId,
			"hazardTypeFieldDefinitionId",
		);
		// "" is a valid value -- matches this entity's own treatment of other free-text columns (design.md Non-Goals).
		if (typeof fieldValue.value !== "string") {
			throw new ValidationError("fieldValues value must be a string");
		}
	}
	assertNoDuplicates(
		fieldValues.map((fv) => fv.hazardTypeFieldDefinitionId),
		"fieldValues",
		"hazardTypeFieldDefinitionId",
	);
}

/** Same shape rules as `validateFieldValues`, own distinct `UNIQUE` constraint and its own membership check against DEF-021's tenant-scoped set (design.md Decisions 3/4). */
function validateCustomFieldValues(
	customFieldValues: readonly HazardousEventCustomFieldValueProps[],
	validCustomFieldDefinitionIds: ReadonlySet<string>,
): void {
	assertIsArray(customFieldValues, "customFieldValues");
	for (const customFieldValue of customFieldValues) {
		assertIsObject(customFieldValue, "customFieldValues");
		assertNonEmptyString(
			customFieldValue.hazardTypeCustomFieldDefinitionId,
			"hazardTypeCustomFieldDefinitionId",
		);
		if (typeof customFieldValue.value !== "string") {
			throw new ValidationError("customFieldValues value must be a string");
		}
	}
	const definitionIds = customFieldValues.map(
		(cfv) => cfv.hazardTypeCustomFieldDefinitionId,
	);
	assertNoDuplicates(
		definitionIds,
		"customFieldValues",
		"hazardTypeCustomFieldDefinitionId",
	);
	assertMembership(
		definitionIds,
		validCustomFieldDefinitionIds,
		"hazardTypeCustomFieldDefinitionId",
		"validCustomFieldDefinitionIds",
	);
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
			// Array-level clone only (spec: "not the live internal array") -- mutating the caller's array
			// (push/splice, not just the getter's copy) can't reach entity state. Contained objects
			// (attachments/fieldValues/customFieldValues elements) are not deep-cloned; the spec scenario
			// this defends against is array mutation, not per-element property mutation.
			hazardDriverIds: [...props.hazardDriverIds],
			attachments: [...props.attachments],
			fieldValues: [...props.fieldValues],
			customFieldValues: [...props.customFieldValues],
		};
	}

	/**
	 * `validHazardDriverIds`/`validCustomFieldDefinitionIds` are mandatory, not optional/defaulted — closes DEF-021 by construction (design.md Decision 4).
	 *
	 * @throws {ValidationError} for an empty, whitespace-only, or non-string tenantId/specificHazardId/startDate
	 *   (Decision 2/10), an invalid createdAt/updatedAt/submittedAt (Decision 9), a present but non-string
	 *   endDate (Decision 11), startDate later than endDate (Decision 3), or any shape/duplicate/membership
	 *   violation in hazardDriverIds/attachments/fieldValues/customFieldValues (Decision 6).
	 */
	static create(
		props: HazardousEventProps,
		validHazardDriverIds: ReadonlySet<string>,
		validCustomFieldDefinitionIds: ReadonlySet<string>,
	): HazardousEvent {
		for (const field of [
			"tenantId",
			"specificHazardId",
			"startDate",
		] as const) {
			assertNonEmptyString(props[field], field);
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
		// endDate is optional: null/undefined or whitespace-only means "not set", not a real date to compare.
		if (
			props.endDate != null &&
			props.endDate.trim().length > 0 &&
			props.startDate > props.endDate
		) {
			throw new ValidationError("startDate must not be later than endDate");
		}

		// Order fixed by design.md Decision 6: drivers -> attachments -> field values -> custom field values.
		validateHazardDriverIds(props.hazardDriverIds, validHazardDriverIds);
		validateAttachments(props.attachments);
		validateFieldValues(props.fieldValues);
		validateCustomFieldValues(
			props.customFieldValues,
			validCustomFieldDefinitionIds,
		);

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

	// Array-level copy on every read (same scope as the constructor's clone above), matching `SpatialObservation.ts`'s `[...props.x]` getter pattern.
	get hazardDriverIds(): readonly string[] {
		return [...this.props.hazardDriverIds];
	}

	get attachments(): readonly HazardousEventAttachmentProps[] {
		return [...this.props.attachments];
	}

	get fieldValues(): readonly HazardousEventFieldValueProps[] {
		return [...this.props.fieldValues];
	}

	get customFieldValues(): readonly HazardousEventCustomFieldValueProps[] {
		return [...this.props.customFieldValues];
	}
}
