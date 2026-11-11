import { ValidationError } from "~/shared/errors";
import {
	isValidFlexibleDateFormat,
	normalizeFlexibleDateCeiling,
	normalizeFlexibleDateFloor,
} from "~/domains/shared/domain/flexibleDateFormat";

/** DB enum on `hazardous_event.hazardous_event_status` — physical/temporal classification, distinct from approval status (design.md Context, DEF-009's surviving leg). */
export const HAZARDOUS_EVENT_STATUS_VALUES = [
	"forecasted",
	"ongoing",
	"passed",
] as const;
export type HazardousEventStatus =
	(typeof HAZARDOUS_EVENT_STATUS_VALUES)[number];

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

/** One `hazardous_event_attachment` row, always fully resolved (a pending File item is the
 * separate `HazardousEventAttachmentInput` type). `id` is typed but not validated (design.md
 * Decision 2). */
export interface HazardousEventAttachmentProps {
	readonly id: string;
	readonly title: string;
	readonly type: "File" | "Link";
	readonly url: string | null;
	readonly tag: ReadonlyArray<{ id: string; name: string }> | null;
	readonly fileKey: string | null;
	readonly fileName: string | null;
	readonly fileType: string | null;
	readonly fileSize: number | null;
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

/** Mirrors WorkflowInstance.ts's predicate, redefined locally to avoid a cross-bounded-context import. */
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

/** Mirrors the table's own type-matching check constraint (ca-shared-attachments-module spec
 * "Attachment field population matches its type") so a bad row fails closed here, not as a raw
 * Postgres 500. title may be "" (spec); no duplicate-value check (design.md Decision 3). */
function validateAttachments(
	attachments: readonly HazardousEventAttachmentProps[],
): void {
	assertIsArray(attachments, "attachments");
	for (const attachment of attachments) {
		assertIsObject(attachment, "attachments");
		if (typeof attachment.title !== "string") {
			throw new ValidationError("title must be a string");
		}
		if (attachment.tag !== null && !Array.isArray(attachment.tag)) {
			throw new ValidationError("tag must be null or an array");
		}
		if (attachment.type === "File") {
			for (const field of ["fileKey", "fileName", "fileType"] as const) {
				assertNonEmptyString(attachment[field], field);
			}
			const { fileSize } = attachment;
			if (
				typeof fileSize !== "number" ||
				!Number.isFinite(fileSize) ||
				!Number.isInteger(fileSize)
			) {
				throw new ValidationError("fileSize must be a finite integer number");
			}
			if (attachment.url !== null) {
				throw new ValidationError(
					"url must be null for a File-type attachment",
				);
			}
		} else if (attachment.type === "Link") {
			if (typeof attachment.url !== "string") {
				throw new ValidationError("url is required for a Link-type attachment");
			}
			for (const field of [
				"fileKey",
				"fileName",
				"fileType",
				"fileSize",
			] as const) {
				if (attachment[field] !== null) {
					throw new ValidationError(
						`${field} must be null for a Link-type attachment`,
					);
				}
			}
		} else {
			throw new ValidationError('type must be "File" or "Link"');
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
	 *   endDate (Decision 11), a non-null hazardousEventStatus outside HAZARDOUS_EVENT_STATUS_VALUES
	 *   (spec: hazardous-event-entity), startDate later than endDate (Decision 3), or any shape/duplicate/membership
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

		// No DB CHECK constraint; mirrors WorkflowInstance.create()'s enum-guard pattern (spec: hazardous-event-entity).
		if (
			props.hazardousEventStatus !== null &&
			!HAZARDOUS_EVENT_STATUS_VALUES.includes(props.hazardousEventStatus)
		) {
			throw new ValidationError(
				`hazardousEventStatus must be one of ${HAZARDOUS_EVENT_STATUS_VALUES.join(", ")}, or null`,
			);
		}

		// A malformed or not-set startDate/endDate skips this check.
		if (
			props.endDate != null &&
			props.endDate.trim().length > 0 &&
			isValidFlexibleDateFormat(props.startDate) &&
			isValidFlexibleDateFormat(props.endDate) &&
			normalizeFlexibleDateFloor(props.startDate) >
				normalizeFlexibleDateCeiling(props.endDate)
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
