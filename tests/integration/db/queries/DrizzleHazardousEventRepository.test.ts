import "../setup";
import { randomUUID } from "crypto";
import { describe, it, expect, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { dr } from "~/db.server";
import { getPinoLogger } from "~/infrastructure/logging/PinoLogger.server";
import { eventTable } from "~/drizzle/schema/eventTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { eventRelationshipTable } from "~/drizzle/schema/eventRelationshipTable";
import { hazardousEventHazardDriverTable } from "~/domains/hazardous-events/infrastructure/hazardousEventHazardDriverTable";
import { hazardousEventAttachmentTable } from "~/domains/hazardous-events/infrastructure/hazardousEventAttachmentTable";
import { hazardousEventFieldValueTable } from "~/domains/hazardous-events/infrastructure/hazardousEventFieldValueTable";
import { hazardousEventCustomFieldValueTable } from "~/domains/hazardous-events/infrastructure/hazardousEventCustomFieldValueTable";
import { hazardDriverTable } from "~/domains/hazardous-events/infrastructure/hazardDriverTable";
import { hazardTypeFieldDefinitionTable } from "~/domains/hazardous-events/infrastructure/hazardTypeFieldDefinitionTable";
import { hazardTypeCustomFieldDefinitionTable } from "~/domains/hazardous-events/infrastructure/hazardTypeCustomFieldDefinitionTable";
import { specificHazardTable } from "~/domains/hazardous-events/infrastructure/specificHazardTable";
import { hazardClusterTable } from "~/domains/hazardous-events/infrastructure/hazardClusterTable";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";
import { hipsVersionTable } from "~/domains/hazardous-events/infrastructure/hipsVersionTable";
import { DrizzleHazardousEventRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server";
import { DrizzleWorkflowRepository } from "~/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server";
import { WorkflowInstance } from "~/domains/validation-workflow/domain/WorkflowInstance";
import { DrizzleHazardTaxonomyRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardTaxonomyRepository.server";
import { DrizzleCausalChainRepository } from "~/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server";
import { UpdateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent";
import type { ILogger } from "~/shared/logging/ILogger";
import { HazardousEvent } from "~/domains/hazardous-events/domain/HazardousEvent";
import type { HazardousEventProps } from "~/domains/hazardous-events/domain/HazardousEvent";
import {
	ConcurrentModificationError,
	ConflictError,
	NotFoundError,
	ValidationError,
} from "~/shared/errors";
import { seedCountryAccount } from "../models/hazardousEventTestHelpers";
import { seedFieldDefinitionDeps } from "../models/hazardTypeFieldDefinitionTestHelpers";
import { seedTextContent } from "../models/textContentTestHelpers";

/** Full taxonomy chain (hipsVersion -> hazardType -> hazardCluster -> specificHazard) a specificHazardId FK needs, same shape as specificHazard.test.ts's own helper. */
async function seedSpecificHazard(): Promise<string> {
	const [hipsVersion] = await dr
		.insert(hipsVersionTable)
		.values({ versionNo: `HIPs ${randomUUID()}` })
		.returning({ id: hipsVersionTable.id });
	const [type] = await dr
		.insert(hazardTypeTable)
		.values({
			id: randomUUID(),
			nameTextContentId: await seedTextContent(`Type ${randomUUID()}`),
			hipsVersionId: hipsVersion.id,
		})
		.returning({ id: hazardTypeTable.id });
	const [cluster] = await dr
		.insert(hazardClusterTable)
		.values({
			id: randomUUID(),
			nameTextContentId: await seedTextContent(`Cluster ${randomUUID()}`),
			hazardTypeId: type.id,
		})
		.returning({ id: hazardClusterTable.id });
	const [specificHazard] = await dr
		.insert(specificHazardTable)
		.values({
			id: randomUUID(),
			nameTextContentId: await seedTextContent(`Hazard ${randomUUID()}`),
			code: `code-${randomUUID()}`,
			hazardClusterId: cluster.id,
		})
		.returning({ id: specificHazardTable.id });
	return specificHazard.id;
}

async function seedHazardDriverRow(tenantId: string): Promise<string> {
	const [row] = await dr
		.insert(hazardDriverTable)
		.values({ name: `Driver ${randomUUID()}`, countryAccountsId: tenantId })
		.returning({ id: hazardDriverTable.id });
	return row.id;
}

async function seedFieldDefinition(): Promise<string> {
	const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();
	const [row] = await dr
		.insert(hazardTypeFieldDefinitionTable)
		.values({
			hazardTypeId: hazardType.id,
			fieldKey: `field-${randomUUID()}`,
			label: "Field",
			dataType: dataType.id,
			required: false,
			unit: unit.id,
		})
		.returning({ id: hazardTypeFieldDefinitionTable.id });
	return row.id;
}

async function seedCustomFieldDefinition(tenantId: string): Promise<string> {
	const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();
	const [row] = await dr
		.insert(hazardTypeCustomFieldDefinitionTable)
		.values({
			countryAccountsId: tenantId,
			hazardTypeId: hazardType.id,
			fieldKey: `custom-field-${randomUUID()}`,
			label: "Custom Field",
			dataType: dataType.id,
			required: false,
			unit: unit.id,
		})
		.returning({ id: hazardTypeCustomFieldDefinitionTable.id });
	return row.id;
}

interface RawHazardousEventOverrides {
	id?: string;
	tenantId?: string;
	specificHazardId?: string | null;
	startDate?: string;
	updatedAt?: Date | null;
	createdAt?: Date;
}

/** Raw multi-table seed bypassing the adapter under test -- the only way to construct a row the domain itself would reject. */
async function seedRawHazardousEvent(
	overrides: RawHazardousEventOverrides = {},
) {
	const tenantId = overrides.tenantId ?? (await seedCountryAccount());
	const specificHazardId =
		overrides.specificHazardId === undefined
			? await seedSpecificHazard()
			: overrides.specificHazardId;
	const [event] = await dr
		.insert(eventTable)
		.values({ id: overrides.id })
		.returning({ id: eventTable.id });
	await dr.insert(hazardousEventTable).values({
		id: event.id,
		countryAccountsId: tenantId,
		specificHazardId,
		startDate: overrides.startDate ?? "2026-01-01",
		endDate: "",
		nationalSpecification: "",
		description: "",
		chainsExplanation: "",
		magnitude: "",
		recordOriginator: "",
		dataSource: "",
		updatedAt: overrides.updatedAt ?? null,
		...(overrides.createdAt !== undefined
			? { createdAt: overrides.createdAt }
			: {}),
	});
	return { id: event.id, tenantId: tenantId as string };
}

async function insertHazardDriverLink(
	hazardousEventId: string,
	hazardDriverId: string,
): Promise<void> {
	await dr
		.insert(hazardousEventHazardDriverTable)
		.values({ hazardousEventId, hazardDriverId });
}

async function insertAttachment(
	hazardousEventId: string,
	overrides: { id?: string } = {},
): Promise<string> {
	const [row] = await dr
		.insert(hazardousEventAttachmentTable)
		.values({
			id: overrides.id ?? randomUUID(),
			hazardousEventId,
			title: "Attachment",
			fileKey: `key-${randomUUID()}`,
			fileName: "file.pdf",
			fileType: "application/pdf",
			fileSize: 1024,
		})
		.returning({ id: hazardousEventAttachmentTable.id });
	return row.id;
}

async function insertFieldValue(
	hazardousEventId: string,
	hazardTypeFieldDefinitionId: string,
	value = "value",
): Promise<void> {
	await dr
		.insert(hazardousEventFieldValueTable)
		.values({ hazardousEventId, hazardTypeFieldDefinitionId, value });
}

/** Common scalar fields for a new entity, each a distinct non-empty value -- a dropped/swapped column in toRow()/toProps() would otherwise still pass, indistinguishable from a DB default.
 * createdByUserId/updatedByUserId/submittedByUserId have no FK constraint (`approvalWorkflowFields` is plain `uuid()`), so any valid uuid works here, not just a seeded user. */
function baseNewEventProps(
	id: string,
	tenantId: string,
	specificHazardId: string,
): HazardousEventProps {
	return {
		id,
		tenantId,
		specificHazardId,
		startDate: "2026-01-01",
		endDate: "2026-01-10",
		nationalSpecification: "national-spec",
		description: "original description",
		chainsExplanation: "original chains explanation",
		magnitude: "5.5",
		recordOriginator: "original originator",
		dataSource: "original source",
		hazardousEventStatus: "ongoing",
		specificHazardLocalName: "original local name",
		specificHazardNationalName: "original national name",
		apiImportId: `api-import-${randomUUID()}`,
		createdByUserId: randomUUID(),
		updatedByUserId: randomUUID(),
		submittedByUserId: randomUUID(),
		submittedAt: new Date("2026-01-01T06:00:00Z"),
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: null,
		hazardDriverIds: [],
		attachments: [],
		fieldValues: [],
		customFieldValues: [],
	};
}

/** Asserts every scalar field toRow()/toProps() maps -- catches a dropped/swapped column a narrower assertion would miss. */
function expectScalarFieldsMatch(
	actual: HazardousEvent,
	expected: HazardousEventProps,
): void {
	expect(actual.tenantId).toBe(expected.tenantId);
	expect(actual.specificHazardId).toBe(expected.specificHazardId);
	expect(actual.startDate).toBe(expected.startDate);
	expect(actual.endDate).toBe(expected.endDate);
	expect(actual.nationalSpecification).toBe(expected.nationalSpecification);
	expect(actual.description).toBe(expected.description);
	expect(actual.chainsExplanation).toBe(expected.chainsExplanation);
	expect(actual.magnitude).toBe(expected.magnitude);
	expect(actual.recordOriginator).toBe(expected.recordOriginator);
	expect(actual.dataSource).toBe(expected.dataSource);
	expect(actual.hazardousEventStatus).toBe(expected.hazardousEventStatus);
	expect(actual.specificHazardLocalName).toBe(expected.specificHazardLocalName);
	expect(actual.specificHazardNationalName).toBe(
		expected.specificHazardNationalName,
	);
	expect(actual.apiImportId).toBe(expected.apiImportId);
	expect(actual.createdByUserId).toBe(expected.createdByUserId);
	expect(actual.updatedByUserId).toBe(expected.updatedByUserId);
	expect(actual.submittedByUserId).toBe(expected.submittedByUserId);
	expect(actual.submittedAt?.getTime()).toBe(expected.submittedAt?.getTime());
	expect(actual.createdAt.getTime()).toBe(expected.createdAt.getTime());
	expect(actual.updatedAt?.getTime()).toBe(expected.updatedAt?.getTime());
}

/** Builds a valid HazardousEvent backed by real FK-referenced ids (specificHazardId/hazardDriverIds/field-definition ids), not placeholder strings a FK would reject. */
function makeHazardousEventEntity(
	props: HazardousEventProps,
	validHazardDriverIds: ReadonlySet<string> = new Set(props.hazardDriverIds),
	validCustomFieldDefinitionIds: ReadonlySet<string> = new Set(
		props.customFieldValues.map((cfv) => cfv.hazardTypeCustomFieldDefinitionId),
	),
): HazardousEvent {
	return HazardousEvent.create(
		props,
		validHazardDriverIds,
		validCustomFieldDefinitionIds,
	);
}

async function insertCustomFieldValue(
	hazardousEventId: string,
	hazardTypeCustomFieldDefinitionId: string,
	value = "value",
): Promise<void> {
	await dr.insert(hazardousEventCustomFieldValueTable).values({
		hazardousEventId,
		hazardTypeCustomFieldDefinitionId,
		value,
	});
}

describe("DrizzleHazardousEventRepository", () => {
	describe("findById", () => {
		it("resolves a persisted entity's full shape including all four child collections", async () => {
			const { id, tenantId } = await seedRawHazardousEvent();
			const hazardDriverId = await seedHazardDriverRow(tenantId);
			await insertHazardDriverLink(id, hazardDriverId);
			await insertAttachment(id);
			const fieldDefinitionId = await seedFieldDefinition();
			await insertFieldValue(id, fieldDefinitionId, "field-value");
			const customFieldDefinitionId = await seedCustomFieldDefinition(tenantId);
			await insertCustomFieldValue(id, customFieldDefinitionId, "custom-value");
			const repo = new DrizzleHazardousEventRepository(dr);

			const found = await repo.findById(id, tenantId);

			expect(found.id).toBe(id);
			expect(found.tenantId).toBe(tenantId);
			expect(found.hazardDriverIds).toEqual([hazardDriverId]);
			expect(found.attachments).toHaveLength(1);
			expect(found.attachments[0].title).toBe("Attachment");
			expect(found.fieldValues).toEqual([
				{
					hazardTypeFieldDefinitionId: fieldDefinitionId,
					value: "field-value",
				},
			]);
			expect(found.customFieldValues).toEqual([
				{
					hazardTypeCustomFieldDefinitionId: customFieldDefinitionId,
					value: "custom-value",
				},
			]);
		});

		it("throws NotFoundError for a missing id", async () => {
			const tenantId = await seedCountryAccount();
			const repo = new DrizzleHazardousEventRepository(dr);

			await expect(
				repo.findById(randomUUID(), tenantId as string),
			).rejects.toThrow(NotFoundError);
		});

		it("throws NotFoundError for a foreign-tenant id, not a cross-tenant leak", async () => {
			const { id } = await seedRawHazardousEvent();
			const otherTenantId = await seedCountryAccount();
			const repo = new DrizzleHazardousEventRepository(dr);

			await expect(repo.findById(id, otherTenantId as string)).rejects.toThrow(
				NotFoundError,
			);
		});

		it("propagates ValidationError unmodified for a row that fails rehydration", async () => {
			// specificHazardId NULL bypasses write-side validation (DEF-031-shaped row).
			const { id, tenantId } = await seedRawHazardousEvent({
				specificHazardId: null,
			});
			const repo = new DrizzleHazardousEventRepository(dr);

			await expect(repo.findById(id, tenantId)).rejects.toThrow(
				ValidationError,
			);
		});
	});

	describe("findAll", () => {
		it("returns only rows for the given tenantId, paginated, in deterministic order across repeated calls", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const otherTenantId = (await seedCountryAccount()) as string;
			// Explicit createdAt: CURRENT_TIMESTAMP's resolution isn't guaranteed distinct per row.
			const base = new Date("2026-02-01T00:00:00Z").getTime();
			const seeded = [
				await seedRawHazardousEvent({ tenantId, createdAt: new Date(base) }),
				await seedRawHazardousEvent({
					tenantId,
					createdAt: new Date(base + 1000),
				}),
				await seedRawHazardousEvent({
					tenantId,
					createdAt: new Date(base + 2000),
				}),
			];
			await seedRawHazardousEvent({ tenantId: otherTenantId });
			const repo = new DrizzleHazardousEventRepository(dr);

			const firstCall = await repo.findAll(tenantId, { page: 1, pageSize: 10 });
			const secondCall = await repo.findAll(tenantId, {
				page: 1,
				pageSize: 10,
			});

			expect(firstCall.map((e) => e.id)).toEqual(seeded.map((s) => s.id));
			expect(secondCall.map((e) => e.id)).toEqual(firstCall.map((e) => e.id));
		});

		it("respects page and pageSize without skipping or repeating a row", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const base = new Date("2026-02-02T00:00:00Z").getTime();
			const seeded = [
				await seedRawHazardousEvent({ tenantId, createdAt: new Date(base) }),
				await seedRawHazardousEvent({
					tenantId,
					createdAt: new Date(base + 1000),
				}),
				await seedRawHazardousEvent({
					tenantId,
					createdAt: new Date(base + 2000),
				}),
			];
			const repo = new DrizzleHazardousEventRepository(dr);

			const firstPage = await repo.findAll(tenantId, { page: 1, pageSize: 2 });
			const secondPage = await repo.findAll(tenantId, {
				page: 2,
				pageSize: 2,
			});

			expect(firstPage.map((e) => e.id)).toEqual(
				seeded.slice(0, 2).map((s) => s.id),
			);
			expect(secondPage.map((e) => e.id)).toEqual(
				seeded.slice(2).map((s) => s.id),
			);
		});

		it("skips a row that fails rehydration, logging a warning, without affecting other rows on the page", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const valid = await seedRawHazardousEvent({ tenantId });
			// specificHazardId NULL fails HazardousEvent.create()'s own validation on rehydration.
			const invalid = await seedRawHazardousEvent({
				tenantId,
				specificHazardId: null,
			});
			const repo = new DrizzleHazardousEventRepository(dr);

			// Matches DrizzleWorkflowRepository.test.ts's own skip-and-log precedent (5a).
			const warnSpy = vi
				.spyOn(getPinoLogger(), "warn")
				.mockImplementation(() => {});
			try {
				const result = await repo.findAll(tenantId, { page: 1, pageSize: 10 });

				expect(result.map((e) => e.id)).toEqual([valid.id]);
				expect(warnSpy).toHaveBeenCalledTimes(1);
				expect(warnSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						msg: "hazardous_event.invariant_violation_skipped",
						id: invalid.id,
					}),
				);
			} finally {
				warnSpy.mockRestore();
			}
		});
	});

	describe("insert", () => {
		it("round-trips a brand-new entity with non-empty values in all four child collections through a subsequent findById", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const hazardDriverId = await seedHazardDriverRow(tenantId);
			const fieldDefinitionId = await seedFieldDefinition();
			const customFieldDefinitionId = await seedCustomFieldDefinition(tenantId);
			const id = randomUUID();
			const attachmentId = randomUUID();
			const attachment = {
				id: attachmentId,
				title: "Attachment",
				fileKey: "key-1",
				fileName: "file.pdf",
				fileType: "application/pdf",
				fileSize: 1024,
			};
			const props = {
				...baseNewEventProps(id, tenantId, specificHazardId),
				hazardDriverIds: [hazardDriverId],
				attachments: [attachment],
				fieldValues: [
					{
						hazardTypeFieldDefinitionId: fieldDefinitionId,
						value: "field-value",
					},
				],
				customFieldValues: [
					{
						hazardTypeCustomFieldDefinitionId: customFieldDefinitionId,
						value: "custom-value",
					},
				],
			};
			const entity = makeHazardousEventEntity(props);
			const repo = new DrizzleHazardousEventRepository(dr);

			const inserted = await repo.insert(entity);

			expect(inserted.id).toBe(id);
			expectScalarFieldsMatch(inserted, props);
			const found = await repo.findById(id, tenantId);
			expectScalarFieldsMatch(found, props);
			expect(found.hazardDriverIds).toEqual([hazardDriverId]);
			expect(found.attachments).toEqual([attachment]);
			expect(found.fieldValues).toEqual([
				{
					hazardTypeFieldDefinitionId: fieldDefinitionId,
					value: "field-value",
				},
			]);
			expect(found.customFieldValues).toEqual([
				{
					hazardTypeCustomFieldDefinitionId: customFieldDefinitionId,
					value: "custom-value",
				},
			]);
		});

		it("persists an entity with every child collection empty, with no child rows and no malformed-empty-insert error", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const id = randomUUID();
			const entity = makeHazardousEventEntity(
				baseNewEventProps(id, tenantId, specificHazardId),
			);
			const repo = new DrizzleHazardousEventRepository(dr);

			await expect(repo.insert(entity)).resolves.toBeDefined();
			const found = await repo.findById(id, tenantId);
			expect(found.hazardDriverIds).toEqual([]);
			expect(found.attachments).toEqual([]);
			expect(found.fieldValues).toEqual([]);
			expect(found.customFieldValues).toEqual([]);
		});

		it("rejects an id collision, not silently overwriting the existing row", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const id = randomUUID();
			const repo = new DrizzleHazardousEventRepository(dr);
			await repo.insert(
				makeHazardousEventEntity(
					baseNewEventProps(id, tenantId, specificHazardId),
				),
			);

			const colliding = makeHazardousEventEntity({
				...baseNewEventProps(id, tenantId, specificHazardId),
				description: "a different event sharing the same id",
			});
			await expect(repo.insert(colliding)).rejects.toThrow(ConflictError);
			const found = await repo.findById(id, tenantId);
			expect(found.description).toBe("original description");
		});

		it("rejects with ConflictError, not a duplicate-id message, when apiImportId collides within the same tenant", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const sharedApiImportId = `api-import-${randomUUID()}`;
			const repo = new DrizzleHazardousEventRepository(dr);
			await repo.insert(
				makeHazardousEventEntity({
					...baseNewEventProps(randomUUID(), tenantId, specificHazardId),
					apiImportId: sharedApiImportId,
				}),
			);

			const second = makeHazardousEventEntity({
				...baseNewEventProps(randomUUID(), tenantId, specificHazardId),
				apiImportId: sharedApiImportId,
			});
			const err = await repo.insert(second).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(ConflictError);
			expect((err as ConflictError).message).toContain("apiImportId");
		});

		// Attachments have no domain-level dedupe (HazardousEvent.ts validateAttachments), so a duplicate attachment id reaches this PK unmapped otherwise (Gate 8 finding).
		it("rejects with ConflictError naming the attachment, not a duplicate-event-id message, when two attachments share an id", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const sharedAttachmentId = randomUUID();
			const entity = makeHazardousEventEntity({
				...baseNewEventProps(randomUUID(), tenantId, specificHazardId),
				attachments: [
					{
						id: sharedAttachmentId,
						title: "First",
						fileKey: "key-1",
						fileName: "a.pdf",
						fileType: "application/pdf",
						fileSize: 1,
					},
					{
						id: sharedAttachmentId,
						title: "Second",
						fileKey: "key-2",
						fileName: "b.pdf",
						fileType: "application/pdf",
						fileSize: 2,
					},
				],
			});
			const repo = new DrizzleHazardousEventRepository(dr);

			const err = await repo.insert(entity).catch((e: unknown) => e);

			expect(err).toBeInstanceOf(ConflictError);
			expect((err as ConflictError).message).toContain("attachment");
		});

		// Sibling-code mapping: a 23503 must reject typed, not leak as a raw driver exception.
		it("rejects with ValidationError, rolling back the whole transaction, when a child collection references a nonexistent id", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const id = randomUUID();
			const unseededDriverId = randomUUID();
			const repo = new DrizzleHazardousEventRepository(dr);

			await expect(
				repo.insert(
					makeHazardousEventEntity({
						...baseNewEventProps(id, tenantId, specificHazardId),
						hazardDriverIds: [unseededDriverId],
					}),
				),
			).rejects.toThrow(ValidationError);

			await expect(repo.findById(id, tenantId)).rejects.toThrow(NotFoundError);
			const eventRows = await dr
				.select()
				.from(eventTable)
				.where(eq(eventTable.id, id));
			expect(eventRows).toHaveLength(0);
		});
	});

	describe("update", () => {
		it("persists a matching expectedUpdatedAt and fully replaces all four child collections", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const oldDriverId = await seedHazardDriverRow(tenantId);
			const newDriverId = await seedHazardDriverRow(tenantId);
			const oldFieldDefinitionId = await seedFieldDefinition();
			const newFieldDefinitionId = await seedFieldDefinition();
			const oldCustomFieldDefinitionId =
				await seedCustomFieldDefinition(tenantId);
			const newCustomFieldDefinitionId =
				await seedCustomFieldDefinition(tenantId);
			// Kept across original -> changed: a missing DELETE before reinsert hits this PK (23505).
			const sharedAttachmentId = randomUUID();
			const id = randomUUID();
			const repo = new DrizzleHazardousEventRepository(dr);
			const originalProps = {
				...baseNewEventProps(id, tenantId, specificHazardId),
				hazardDriverIds: [oldDriverId],
				attachments: [
					{
						id: sharedAttachmentId,
						title: "Shared",
						fileKey: "key-shared",
						fileName: "shared.pdf",
						fileType: "application/pdf",
						fileSize: 10,
					},
					{
						id: randomUUID(),
						title: "Removed",
						fileKey: "key-removed",
						fileName: "removed.pdf",
						fileType: "application/pdf",
						fileSize: 20,
					},
				],
				fieldValues: [
					{
						hazardTypeFieldDefinitionId: oldFieldDefinitionId,
						value: "old-field-value",
					},
				],
				customFieldValues: [
					{
						hazardTypeCustomFieldDefinitionId: oldCustomFieldDefinitionId,
						value: "old-custom-value",
					},
				],
			};
			const original = makeHazardousEventEntity(originalProps);
			await repo.insert(original);

			const addedAttachmentId = randomUUID();
			const changedProps = {
				...baseNewEventProps(id, tenantId, specificHazardId),
				hazardDriverIds: [newDriverId],
				description: "updated description",
				updatedAt: new Date("2026-01-02T00:00:00Z"),
				attachments: [
					{
						id: sharedAttachmentId,
						title: "Shared",
						fileKey: "key-shared",
						fileName: "shared.pdf",
						fileType: "application/pdf",
						fileSize: 10,
					},
					{
						id: addedAttachmentId,
						title: "Added",
						fileKey: "key-added",
						fileName: "added.pdf",
						fileType: "application/pdf",
						fileSize: 30,
					},
				],
				fieldValues: [
					{
						hazardTypeFieldDefinitionId: newFieldDefinitionId,
						value: "new-field-value",
					},
				],
				customFieldValues: [
					{
						hazardTypeCustomFieldDefinitionId: newCustomFieldDefinitionId,
						value: "new-custom-value",
					},
				],
			};
			const changed = makeHazardousEventEntity(changedProps);
			const updated = await repo.update(changed, original.updatedAt);

			expectScalarFieldsMatch(updated, changedProps);
			const found = await repo.findById(id, tenantId);
			expectScalarFieldsMatch(found, changedProps);
			expect(found.hazardDriverIds).toEqual([newDriverId]);
			expect(found.attachments.map((a) => a.id).sort()).toEqual(
				[sharedAttachmentId, addedAttachmentId].sort(),
			);
			expect(found.fieldValues).toEqual([
				{
					hazardTypeFieldDefinitionId: newFieldDefinitionId,
					value: "new-field-value",
				},
			]);
			expect(found.customFieldValues).toEqual([
				{
					hazardTypeCustomFieldDefinitionId: newCustomFieldDefinitionId,
					value: "new-custom-value",
				},
			]);
		});

		it("accepts a null expectedUpdatedAt for a row never updated since insert()", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const id = randomUUID();
			const repo = new DrizzleHazardousEventRepository(dr);
			const original = makeHazardousEventEntity(
				baseNewEventProps(id, tenantId, specificHazardId),
			);
			await repo.insert(original);
			expect(original.updatedAt).toBeNull();

			const changed = makeHazardousEventEntity({
				...baseNewEventProps(id, tenantId, specificHazardId),
				description: "first update",
				updatedAt: new Date("2026-01-02T00:00:00Z"),
			});
			await expect(repo.update(changed, null)).resolves.toBeDefined();
			const found = await repo.findById(id, tenantId);
			expect(found.description).toBe("first update");
		});

		// Chains a real findById-read token through two further updates: match, then stale.
		it("accepts a real (non-null) expectedUpdatedAt read back from findById, and rejects a now-stale one", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const id = randomUUID();
			const repo = new DrizzleHazardousEventRepository(dr);
			await repo.insert(
				makeHazardousEventEntity(
					baseNewEventProps(id, tenantId, specificHazardId),
				),
			);
			await repo.update(
				makeHazardousEventEntity({
					...baseNewEventProps(id, tenantId, specificHazardId),
					description: "first update",
					updatedAt: new Date("2026-01-02T00:00:00Z"),
				}),
				null,
			);
			const afterFirstUpdate = await repo.findById(id, tenantId);
			expect(afterFirstUpdate.updatedAt).not.toBeNull();

			const second = makeHazardousEventEntity({
				...baseNewEventProps(id, tenantId, specificHazardId),
				description: "second update",
				updatedAt: new Date("2026-01-03T00:00:00Z"),
			});
			await expect(
				repo.update(second, afterFirstUpdate.updatedAt),
			).resolves.toBeDefined();

			const third = makeHazardousEventEntity({
				...baseNewEventProps(id, tenantId, specificHazardId),
				description: "third update (stale)",
				updatedAt: new Date("2026-01-04T00:00:00Z"),
			});
			// Reuses the now-stale token -- proves the equality check, not just "accepted once".
			await expect(
				repo.update(third, afterFirstUpdate.updatedAt),
			).rejects.toThrow(ConcurrentModificationError);
		});

		// Pins the millisecond-truncated comparison (Decision 3) against a microsecond-precision value.
		it("matches a legacy-shaped, microsecond-precision updated_at via the millisecond-truncated comparison", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const id = randomUUID();
			const repo = new DrizzleHazardousEventRepository(dr);
			await repo.insert(
				makeHazardousEventEntity(
					baseNewEventProps(id, tenantId, specificHazardId),
				),
			);
			const legacyTimestamp = "2026-01-02 03:04:05.123456";
			await dr.execute(
				sql`UPDATE hazardous_event SET updated_at = ${legacyTimestamp}::timestamp WHERE id = ${id}::uuid`,
			);

			const beforeUpdate = await repo.findById(id, tenantId);
			expect(beforeUpdate.updatedAt?.toISOString()).toBe(
				"2026-01-02T03:04:05.123Z",
			);

			const changed = makeHazardousEventEntity({
				...baseNewEventProps(id, tenantId, specificHazardId),
				description: "post-legacy-row update",
				updatedAt: new Date("2026-01-05T00:00:00Z"),
			});
			await expect(
				repo.update(changed, beforeUpdate.updatedAt),
			).resolves.toBeDefined();
		});

		// Forces a non-UTC session to prove Decision 3's "no ::timestamptz cast" genuinely holds.
		it("is unaffected by the session's own TimeZone, confirming no ::timestamptz cast (design.md Decision 3)", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const id = randomUUID();
			const repo = new DrizzleHazardousEventRepository(dr);
			await repo.insert(
				makeHazardousEventEntity(
					baseNewEventProps(id, tenantId, specificHazardId),
				),
			);
			await repo.update(
				makeHazardousEventEntity({
					...baseNewEventProps(id, tenantId, specificHazardId),
					description: "first update",
					updatedAt: new Date("2026-01-02T00:00:00Z"),
				}),
				null,
			);
			const afterFirstUpdate = await repo.findById(id, tenantId);

			await dr.execute(sql`SET TIME ZONE 'Asia/Kolkata'`);
			try {
				const changed = makeHazardousEventEntity({
					...baseNewEventProps(id, tenantId, specificHazardId),
					description: "update under a non-UTC session timezone",
					updatedAt: new Date("2026-01-03T00:00:00Z"),
				});
				await expect(
					repo.update(changed, afterFirstUpdate.updatedAt),
				).resolves.toBeDefined();
			} finally {
				await dr.execute(sql`RESET TIME ZONE`);
			}
		});

		it("rejects a stale expectedUpdatedAt with ConcurrentModificationError, touching no child collection", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const keptDriverId = await seedHazardDriverRow(tenantId);
			const fieldDefinitionId = await seedFieldDefinition();
			const customFieldDefinitionId = await seedCustomFieldDefinition(tenantId);
			const keptAttachmentId = randomUUID();
			const id = randomUUID();
			const repo = new DrizzleHazardousEventRepository(dr);
			const original = makeHazardousEventEntity({
				...baseNewEventProps(id, tenantId, specificHazardId),
				hazardDriverIds: [keptDriverId],
			});
			await repo.insert(original);
			const firstUpdateProps = {
				...baseNewEventProps(id, tenantId, specificHazardId),
				hazardDriverIds: [keptDriverId],
				updatedAt: new Date("2026-01-02T00:00:00Z"),
				attachments: [
					{
						id: keptAttachmentId,
						title: "Kept",
						fileKey: "key-kept",
						fileName: "kept.pdf",
						fileType: "application/pdf",
						fileSize: 10,
					},
				],
				fieldValues: [
					{
						hazardTypeFieldDefinitionId: fieldDefinitionId,
						value: "kept-field-value",
					},
				],
				customFieldValues: [
					{
						hazardTypeCustomFieldDefinitionId: customFieldDefinitionId,
						value: "kept-custom-value",
					},
				],
			};
			const firstUpdate = makeHazardousEventEntity(firstUpdateProps);
			await repo.update(firstUpdate, original.updatedAt);

			// Everything emptied/changed -- would be the wrong result if rejection didn't stop it.
			const staleAttempt = makeHazardousEventEntity({
				...baseNewEventProps(id, tenantId, specificHazardId),
				hazardDriverIds: [],
				attachments: [],
				fieldValues: [],
				customFieldValues: [],
				description: "stale write",
				updatedAt: new Date("2026-01-03T00:00:00Z"),
			});
			await expect(
				repo.update(staleAttempt, original.updatedAt),
			).rejects.toThrow(ConcurrentModificationError);

			const found = await repo.findById(id, tenantId);
			expectScalarFieldsMatch(found, firstUpdateProps);
			expect(found.hazardDriverIds).toEqual([keptDriverId]);
			expect(found.attachments).toEqual(firstUpdateProps.attachments);
			expect(found.fieldValues).toEqual(firstUpdateProps.fieldValues);
			expect(found.customFieldValues).toEqual(
				firstUpdateProps.customFieldValues,
			);
		});

		it("lets exactly one of two concurrent updates against the same previously-read row win, with no interleaving", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const driverA = await seedHazardDriverRow(tenantId);
			const driverB = await seedHazardDriverRow(tenantId);
			const id = randomUUID();
			const repo = new DrizzleHazardousEventRepository(dr);
			const original = makeHazardousEventEntity(
				baseNewEventProps(id, tenantId, specificHazardId),
			);
			await repo.insert(original);

			// Distinct hazardDriverIds too -- "no interleaving" must hold for every field, not one.
			const callerAProps = {
				...baseNewEventProps(id, tenantId, specificHazardId),
				description: "caller A",
				hazardDriverIds: [driverA],
				updatedAt: new Date("2026-01-02T00:00:00Z"),
			};
			const callerBProps = {
				...baseNewEventProps(id, tenantId, specificHazardId),
				description: "caller B",
				hazardDriverIds: [driverB],
				updatedAt: new Date("2026-01-03T00:00:00Z"),
			};
			const callerA = makeHazardousEventEntity(callerAProps);
			const callerB = makeHazardousEventEntity(callerBProps);

			const outcomes = await Promise.allSettled([
				repo.update(callerA, original.updatedAt),
				repo.update(callerB, original.updatedAt),
			]);

			const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
			const rejected = outcomes.filter((o) => o.status === "rejected");
			expect(fulfilled).toHaveLength(1);
			expect(rejected).toHaveLength(1);
			expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
				ConcurrentModificationError,
			);

			const found = await repo.findById(id, tenantId);
			const winnerDescription = (
				fulfilled[0] as PromiseFulfilledResult<HazardousEvent>
			).value.description;
			const winnerProps =
				winnerDescription === "caller A" ? callerAProps : callerBProps;
			expect(["caller A", "caller B"]).toContain(winnerDescription);
			expectScalarFieldsMatch(found, winnerProps);
			expect(found.hazardDriverIds).toEqual(winnerProps.hazardDriverIds);
		});

		it("rejects with ConcurrentModificationError, not resurrecting the row, when the row no longer exists", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const id = randomUUID();
			const repo = new DrizzleHazardousEventRepository(dr);
			const original = makeHazardousEventEntity(
				baseNewEventProps(id, tenantId, specificHazardId),
			);
			await repo.insert(original);
			// Raw delete bypasses the adapter's own delete(), isolating update()'s CAS guard.
			await dr
				.delete(hazardousEventTable)
				.where(eq(hazardousEventTable.id, id));
			await dr.delete(eventTable).where(eq(eventTable.id, id));

			const staleUpdate = makeHazardousEventEntity({
				...baseNewEventProps(id, tenantId, specificHazardId),
				updatedAt: new Date("2026-01-02T00:00:00Z"),
			});
			await expect(
				repo.update(staleUpdate, original.updatedAt),
			).rejects.toThrow(ConcurrentModificationError);

			await expect(repo.findById(id, tenantId)).rejects.toThrow(NotFoundError);
		});

		it("rejects with ConflictError, not ConcurrentModificationError, when the id belongs to a different tenant", async () => {
			const tenantA = (await seedCountryAccount()) as string;
			const tenantB = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const id = randomUUID();
			const repo = new DrizzleHazardousEventRepository(dr);
			const original = makeHazardousEventEntity(
				baseNewEventProps(id, tenantA, specificHazardId),
			);
			await repo.insert(original);

			const wrongTenantAttempt = makeHazardousEventEntity({
				...baseNewEventProps(id, tenantB, specificHazardId),
				description: "wrong tenant",
			});
			const err = await repo
				.update(wrongTenantAttempt, original.updatedAt)
				.catch((e: unknown) => e);
			// CME extends ConflictError -- the explicit `.not` confirms this is identity-mismatch.
			expect(err).toBeInstanceOf(ConflictError);
			expect(err).not.toBeInstanceOf(ConcurrentModificationError);

			const found = await repo.findById(id, tenantA);
			expect(found.description).toBe("original description");
		});

		it("rejects with ValidationError, touching no child collection, on malformed input (22P02)", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const keptDriverId = await seedHazardDriverRow(tenantId);
			const id = randomUUID();
			const repo = new DrizzleHazardousEventRepository(dr);
			const original = makeHazardousEventEntity({
				...baseNewEventProps(id, tenantId, specificHazardId),
				hazardDriverIds: [keptDriverId],
			});
			await repo.insert(original);

			const malformed = makeHazardousEventEntity({
				...baseNewEventProps(id, tenantId, specificHazardId),
				hazardDriverIds: [],
				updatedByUserId: "not-a-uuid",
				updatedAt: new Date("2026-01-02T00:00:00Z"),
			});
			await expect(repo.update(malformed, original.updatedAt)).rejects.toThrow(
				ValidationError,
			);

			const found = await repo.findById(id, tenantId);
			expect(found.hazardDriverIds).toEqual([keptDriverId]);
			expect(found.updatedByUserId).toBe(original.updatedByUserId);
		});

		it("rejects with ValidationError, rolling back the delete-and-reinsert, when a changed child collection references a nonexistent id", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const keptDriverId = await seedHazardDriverRow(tenantId);
			const unseededDriverId = randomUUID();
			const id = randomUUID();
			const repo = new DrizzleHazardousEventRepository(dr);
			const original = makeHazardousEventEntity({
				...baseNewEventProps(id, tenantId, specificHazardId),
				hazardDriverIds: [keptDriverId],
			});
			await repo.insert(original);

			const changed = makeHazardousEventEntity({
				...baseNewEventProps(id, tenantId, specificHazardId),
				hazardDriverIds: [unseededDriverId],
				updatedAt: new Date("2026-01-02T00:00:00Z"),
			});
			await expect(repo.update(changed, original.updatedAt)).rejects.toThrow(
				ValidationError,
			);

			// Rollback must restore the original collection, not leave it empty post-delete.
			const found = await repo.findById(id, tenantId);
			expect(found.hazardDriverIds).toEqual([keptDriverId]);
		});
	});

	describe("delete", () => {
		it("removes the hazardous_event row, incoming event_relationship rows, and the event supertype row, in one transaction", async () => {
			const { id, tenantId } = await seedRawHazardousEvent();
			const { id: causeId } = await seedRawHazardousEvent({ tenantId });
			// This event (id) as the effect/child side -- the incoming role delete() cleans up.
			await dr
				.insert(eventRelationshipTable)
				.values({ parentId: causeId, childId: id, type: "caused_by" });
			const repo = new DrizzleHazardousEventRepository(dr);

			await repo.delete(id, tenantId);

			const heRows = await dr
				.select()
				.from(hazardousEventTable)
				.where(eq(hazardousEventTable.id, id));
			const eventRows = await dr
				.select()
				.from(eventTable)
				.where(eq(eventTable.id, id));
			const relationshipRows = await dr
				.select()
				.from(eventRelationshipTable)
				.where(eq(eventRelationshipTable.childId, id));
			expect(heRows).toHaveLength(0);
			expect(eventRows).toHaveLength(0);
			expect(relationshipRows).toHaveLength(0);
		});

		it("cascades to remove all four child collections, not just the parent rows", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const hazardDriverId = await seedHazardDriverRow(tenantId);
			const fieldDefinitionId = await seedFieldDefinition();
			const customFieldDefinitionId = await seedCustomFieldDefinition(tenantId);
			const id = randomUUID();
			const repo = new DrizzleHazardousEventRepository(dr);
			await repo.insert(
				makeHazardousEventEntity({
					...baseNewEventProps(id, tenantId, specificHazardId),
					hazardDriverIds: [hazardDriverId],
					attachments: [
						{
							id: randomUUID(),
							title: "Attachment",
							fileKey: "key-1",
							fileName: "file.pdf",
							fileType: "application/pdf",
							fileSize: 1,
						},
					],
					fieldValues: [
						{
							hazardTypeFieldDefinitionId: fieldDefinitionId,
							value: "field-value",
						},
					],
					customFieldValues: [
						{
							hazardTypeCustomFieldDefinitionId: customFieldDefinitionId,
							value: "custom-value",
						},
					],
				}),
			);

			await repo.delete(id, tenantId);

			const driverRows = await dr
				.select()
				.from(hazardousEventHazardDriverTable)
				.where(eq(hazardousEventHazardDriverTable.hazardousEventId, id));
			const attachmentRows = await dr
				.select()
				.from(hazardousEventAttachmentTable)
				.where(eq(hazardousEventAttachmentTable.hazardousEventId, id));
			const fieldValueRows = await dr
				.select()
				.from(hazardousEventFieldValueTable)
				.where(eq(hazardousEventFieldValueTable.hazardousEventId, id));
			const customFieldValueRows = await dr
				.select()
				.from(hazardousEventCustomFieldValueTable)
				.where(eq(hazardousEventCustomFieldValueTable.hazardousEventId, id));
			expect(driverRows).toHaveLength(0);
			expect(attachmentRows).toHaveLength(0);
			expect(fieldValueRows).toHaveLength(0);
			expect(customFieldValueRows).toHaveLength(0);
		});

		it("touches nothing for a foreign-tenant id -- not the hazardous_event row, not any event_relationship row, not the event row", async () => {
			const { id, tenantId } = await seedRawHazardousEvent();
			const otherTenantId = (await seedCountryAccount()) as string;
			const { id: causeId } = await seedRawHazardousEvent({ tenantId });
			await dr
				.insert(eventRelationshipTable)
				.values({ parentId: causeId, childId: id, type: "caused_by" });
			const repo = new DrizzleHazardousEventRepository(dr);

			await expect(repo.delete(id, otherTenantId)).resolves.toBeUndefined();

			await expect(repo.findById(id, tenantId)).resolves.toBeDefined();
			const relationshipRows = await dr
				.select()
				.from(eventRelationshipTable)
				.where(eq(eventRelationshipTable.childId, id));
			expect(relationshipRows).toHaveLength(1);
			const eventRows = await dr
				.select()
				.from(eventTable)
				.where(eq(eventTable.id, id));
			expect(eventRows).toHaveLength(1);
		});

		it("rejects with ConflictError, rolling back the whole transaction, when a pre-existing outgoing event_relationship row exists", async () => {
			const { id, tenantId } = await seedRawHazardousEvent();
			const { id: effectId } = await seedRawHazardousEvent({ tenantId });
			const { id: causeId } = await seedRawHazardousEvent({ tenantId });
			// Outgoing role (Decision 8's inherited gap) must map to ConflictError, not leak raw.
			await dr
				.insert(eventRelationshipTable)
				.values({ parentId: id, childId: effectId, type: "caused_by" });
			// Also an incoming row -- rollback must leave both roles intact, not just this one.
			await dr
				.insert(eventRelationshipTable)
				.values({ parentId: causeId, childId: id, type: "caused_by" });
			const repo = new DrizzleHazardousEventRepository(dr);

			await expect(repo.delete(id, tenantId)).rejects.toThrow(ConflictError);

			// Whole transaction rolled back -- nothing partially deleted.
			await expect(repo.findById(id, tenantId)).resolves.toBeDefined();
			const outgoingRows = await dr
				.select()
				.from(eventRelationshipTable)
				.where(eq(eventRelationshipTable.parentId, id));
			expect(outgoingRows).toHaveLength(1);
			const incomingRows = await dr
				.select()
				.from(eventRelationshipTable)
				.where(eq(eventRelationshipTable.childId, id));
			expect(incomingRows).toHaveLength(1);
		});

		it("resolves both calls without throwing when delete() is called twice concurrently for the same zero-dependency event", async () => {
			const { id, tenantId } = await seedRawHazardousEvent();
			const repo = new DrizzleHazardousEventRepository(dr);

			await expect(
				Promise.all([repo.delete(id, tenantId), repo.delete(id, tenantId)]),
			).resolves.toEqual([undefined, undefined]);
		});

		// Only one specific 23503 constraint is mapped to ConflictError -- any other rethrows raw.
		it("lets an unmapped 23503 (a referencing disaster_event row) propagate raw, not mapped to ConflictError", async () => {
			const { id, tenantId } = await seedRawHazardousEvent();
			const [disasterEventRow] = await dr
				.insert(eventTable)
				.values({})
				.returning({ id: eventTable.id });
			await dr
				.insert(disasterEventTable)
				.values({ id: disasterEventRow.id, hazardousEventId: id });
			const repo = new DrizzleHazardousEventRepository(dr);

			const err = await repo.delete(id, tenantId).catch((e: unknown) => e);

			expect(err).not.toBeInstanceOf(ConflictError);
			expect(err).not.toBeInstanceOf(ValidationError);
			const cause = (err as { cause?: { code?: string; constraint?: string } })
				.cause;
			expect(cause?.code).toBe("23503");
			expect(cause?.constraint).toBe(
				"disaster_event_hazardous_event_id_hazardous_event_id_fk",
			);
			// Whole transaction rolled back -- nothing partially deleted.
			await expect(repo.findById(id, tenantId)).resolves.toBeDefined();
		});
	});

	describe("countReferencingDisasterEvents", () => {
		async function seedDisasterEvent(
			hazardousEventId: string,
			countryAccountsId: string | null,
		): Promise<void> {
			const [event] = await dr
				.insert(eventTable)
				.values({})
				.returning({ id: eventTable.id });
			await dr.insert(disasterEventTable).values({
				id: event.id,
				hazardousEventId,
				countryAccountsId,
			});
		}

		it("resolves zero when no disaster_event row references the given hazardousEventId", async () => {
			const { id, tenantId } = await seedRawHazardousEvent();
			const repo = new DrizzleHazardousEventRepository(dr);

			await expect(
				repo.countReferencingDisasterEvents(id, tenantId),
			).resolves.toBe(0);
		});

		it("resolves the count of multiple referencing disaster_event rows", async () => {
			const { id, tenantId } = await seedRawHazardousEvent();
			await seedDisasterEvent(id, tenantId);
			await seedDisasterEvent(id, tenantId);
			const repo = new DrizzleHazardousEventRepository(dr);

			await expect(
				repo.countReferencingDisasterEvents(id, tenantId),
			).resolves.toBe(2);
		});

		it("excludes a disaster_event row referencing a different hazardousEventId", async () => {
			const { id, tenantId } = await seedRawHazardousEvent();
			const { id: otherId } = await seedRawHazardousEvent({ tenantId });
			await seedDisasterEvent(otherId, tenantId);
			const repo = new DrizzleHazardousEventRepository(dr);

			await expect(
				repo.countReferencingDisasterEvents(id, tenantId),
			).resolves.toBe(0);
		});

		it("still counts a referencing disaster_event row belonging to a different tenant", async () => {
			const { id, tenantId } = await seedRawHazardousEvent();
			const otherTenantId = (await seedCountryAccount()) as string;
			await seedDisasterEvent(id, otherTenantId);
			const repo = new DrizzleHazardousEventRepository(dr);

			await expect(
				repo.countReferencingDisasterEvents(id, tenantId),
			).resolves.toBe(1);
		});

		it("still counts a referencing disaster_event row with a null countryAccountsId", async () => {
			const { id, tenantId } = await seedRawHazardousEvent();
			await seedDisasterEvent(id, null);
			const repo = new DrizzleHazardousEventRepository(dr);

			await expect(
				repo.countReferencingDisasterEvents(id, tenantId),
			).resolves.toBe(1);
		});

		it("is unaffected by a tenantId argument unrelated to either the hazardous_event or disaster_event rows' own tenant", async () => {
			const { id, tenantId } = await seedRawHazardousEvent();
			await seedDisasterEvent(id, tenantId);
			const unrelatedTenantId = (await seedCountryAccount()) as string;
			const repo = new DrizzleHazardousEventRepository(dr);

			await expect(
				repo.countReferencingDisasterEvents(id, unrelatedTenantId),
			).resolves.toBe(1);
		});
	});
});

/** No-op logger -- logging isn't under test here. */
class NoOpLogger implements ILogger {
	info(): void {}
	warn(): void {}
	error(): void {}
	debug(): void {}
}

/** Test-only subclass: barriers both racers' update() calls until both arrive, so they read the same findById token before either writes (design.md "race against the real adapter"). */
class RaceBarrierHazardousEventRepository extends DrizzleHazardousEventRepository {
	private arrivals = 0;
	private release: () => void = () => {};
	private readonly barrier = new Promise<void>((resolve) => {
		this.release = resolve;
	});

	override async update(
		entity: HazardousEvent,
		expectedUpdatedAt: Date | null,
	): Promise<HazardousEvent> {
		this.arrivals += 1;
		if (this.arrivals >= 2) {
			this.release();
		}
		await this.barrier;
		return super.update(entity, expectedUpdatedAt);
	}
}

describe("UpdateHazardousEventUseCase against the real adapter", () => {
	it("lets exactly one of two concurrent execute() calls for the same event win, racing against the real DrizzleHazardousEventRepository", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const actingUserId = randomUUID();
		const id = randomUUID();
		const setupRepo = new DrizzleHazardousEventRepository(dr);
		const workflowRepository = new DrizzleWorkflowRepository(dr);
		const taxonomyRepository = new DrizzleHazardTaxonomyRepository(dr);
		const causalChainRepository = new DrizzleCausalChainRepository(dr);
		const recordSpatialObservationUseCase = {
			execute: async (): Promise<never> => {
				throw new Error("not used -- no spatialObservation is sent");
			},
		};

		await setupRepo.insert(
			makeHazardousEventEntity(
				baseNewEventProps(id, tenantId, specificHazardId),
			),
		);
		await workflowRepository.insert(
			WorkflowInstance.createDraft({
				id: randomUUID(),
				entityId: id,
				entityType: "HE",
				now: new Date("2026-01-01T00:00:00Z"),
			}),
		);
		// Non-null updatedAt -- exercises the date_trunc CAS branch, the common production path.
		await setupRepo.update(
			makeHazardousEventEntity({
				...baseNewEventProps(id, tenantId, specificHazardId),
				updatedAt: new Date("2026-01-02T00:00:00Z"),
			}),
			null,
		);
		const beforeRace = await setupRepo.findById(id, tenantId);
		expect(beforeRace.updatedAt).not.toBeNull();

		const raceRepo = new RaceBarrierHazardousEventRepository(dr);
		const useCase = new UpdateHazardousEventUseCase(
			new NoOpLogger(),
			taxonomyRepository,
			raceRepo,
			workflowRepository,
			causalChainRepository,
			recordSpatialObservationUseCase,
		);

		const outcomes = await Promise.allSettled([
			useCase.execute({
				id,
				tenantId,
				actingUserId,
				description: "caller A",
			}),
			useCase.execute({
				id,
				tenantId,
				actingUserId,
				description: "caller B",
			}),
		]);

		const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
		const rejected = outcomes.filter((o) => o.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
			ConcurrentModificationError,
		);

		const found = await setupRepo.findById(id, tenantId);
		expect(["caller A", "caller B"]).toContain(found.description);
		const winnerDescription = (
			fulfilled[0] as PromiseFulfilledResult<{ description: string }>
		).value.description;
		expect(found.description).toBe(winnerDescription);
	});
});
