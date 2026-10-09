import "../../db/setup";
import { randomUUID } from "crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { dr } from "~/db.server";
import { workflowInstanceTable } from "~/domains/validation-workflow/infrastructure/workflowInstanceTable";
import { DrizzleWorkflowRepository } from "~/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server";
import {
	WorkflowInstance,
	type EntityType,
} from "~/domains/validation-workflow/domain/WorkflowInstance";
import { ConflictError, ValidationError } from "~/shared/errors";
import { getPinoLogger } from "~/infrastructure/logging/PinoLogger.server";
import {
	seedHazardousEvent,
	seedUser,
} from "../../db/models/hazardousEventTestHelpers";

const repository = new DrizzleWorkflowRepository(dr);

function draft(
	entityId: string,
	entityType: EntityType = "HE",
	now: Date = new Date(),
): WorkflowInstance {
	return WorkflowInstance.createDraft({
		id: randomUUID(),
		entityId,
		entityType,
		now,
	});
}

/** Full-field snapshot: a swapped field (e.g. validatedByUserId/approvedByUserId) fails equality
 * where spot-checking a few fields wouldn't catch it. */
function fieldsOf(instance: WorkflowInstance) {
	return {
		id: instance.id,
		entityId: instance.entityId,
		entityType: instance.entityType,
		status: instance.status,
		submittedByUserId: instance.submittedByUserId,
		submittedAt: instance.submittedAt?.toISOString() ?? null,
		validatedByUserId: instance.validatedByUserId,
		validatedAt: instance.validatedAt?.toISOString() ?? null,
		approvedByUserId: instance.approvedByUserId,
		approvedAt: instance.approvedAt?.toISOString() ?? null,
		publishedByUserId: instance.publishedByUserId,
		publishedAt: instance.publishedAt?.toISOString() ?? null,
		createdAt: instance.createdAt.toISOString(),
		updatedAt: instance.updatedAt.toISOString(),
	};
}

async function rowsFor(entityId: string, entityType: EntityType) {
	return dr
		.select()
		.from(workflowInstanceTable)
		.where(
			and(
				eq(workflowInstanceTable.entityId, entityId),
				eq(workflowInstanceTable.entityType, entityType),
			),
		);
}

/** Raw insert bypassing create(): SUBMITTED with a null submitted pair is invariant-invalid. */
async function insertInvalidRow(
	entityId: string,
	entityType: EntityType = "HE",
) {
	await dr.insert(workflowInstanceTable).values({
		entityId,
		entityType,
		status: "SUBMITTED",
		submittedByUserId: null,
		submittedAt: null,
	});
}

describe("DrizzleWorkflowRepository", () => {
	describe("findByEntity", () => {
		it("resolves the matching instance, every field matching the persisted row", async () => {
			const entityId = randomUUID();
			const instance = draft(entityId);
			await repository.save(instance);

			const found = await repository.findByEntity(entityId, "HE");

			expect(found).not.toBeNull();
			expect(fieldsOf(found!)).toEqual(fieldsOf(instance));
		});

		it("resolves null when no row exists for this entityId at all", async () => {
			await expect(
				repository.findByEntity(randomUUID(), "HE"),
			).resolves.toBeNull();
		});

		it("does not return a row belonging to a different entityType for the same entityId", async () => {
			const entityId = randomUUID();
			await repository.save(draft(entityId, "DE"));

			await expect(repository.findByEntity(entityId, "HE")).resolves.toBeNull();
			await expect(
				repository.findByEntity(entityId, "DE"),
			).resolves.not.toBeNull();
		});

		it("rejects with ValidationError when the persisted row fails WorkflowInstance.create()'s own invariant", async () => {
			const entityId = randomUUID();
			await insertInvalidRow(entityId);

			await expect(repository.findByEntity(entityId, "HE")).rejects.toThrow(
				ValidationError,
			);
		});
	});

	describe("findByEntityIds", () => {
		it("resolves the existing instances in a single query, omitting a missing id in the middle", async () => {
			const idA = randomUUID();
			const idB = randomUUID();
			const idC = randomUUID();
			await repository.save(draft(idA));
			await repository.save(draft(idC));

			const querySpy = vi.spyOn(dr.$client, "query");
			try {
				const result = await repository.findByEntityIds([idA, idB, idC], "HE");

				expect(result.map((instance) => instance.entityId).sort()).toEqual(
					[idA, idC].sort(),
				);
				expect(querySpy).toHaveBeenCalledTimes(1);
			} finally {
				querySpy.mockRestore();
			}
		});

		it("does not return a row belonging to a different entityType in a batched call", async () => {
			const entityId = randomUUID();
			await repository.save(draft(entityId, "DE"));

			const result = await repository.findByEntityIds([entityId], "HE");

			expect(result).toEqual([]);
		});

		it("resolves an empty array without querying when entityIds is empty", async () => {
			const querySpy = vi.spyOn(dr.$client, "query");
			try {
				const result = await repository.findByEntityIds([], "HE");

				expect(result).toEqual([]);
				expect(querySpy).not.toHaveBeenCalled();
			} finally {
				querySpy.mockRestore();
			}
		});

		it("skips and logs a row that fails invariant validation, resolving the other valid rows without throwing", async () => {
			const idA = randomUUID();
			const idB = randomUUID();
			const idC = randomUUID();
			await repository.save(draft(idA));
			await insertInvalidRow(idB);
			await repository.save(draft(idC));

			const warnSpy = vi
				.spyOn(getPinoLogger(), "warn")
				.mockImplementation(() => {});
			try {
				const result = await repository.findByEntityIds([idA, idB, idC], "HE");

				expect(result.map((instance) => instance.entityId).sort()).toEqual(
					[idA, idC].sort(),
				);
				expect(warnSpy).toHaveBeenCalledTimes(1);
				expect(warnSpy).toHaveBeenCalledWith(
					expect.objectContaining({ entityId: idB, entityType: "HE" }),
				);
			} finally {
				warnSpy.mockRestore();
			}
		});

		it("propagates a non-ValidationError thrown during row mapping, rather than swallowing it (per ADR-003)", async () => {
			const idA = randomUUID();
			const idB = randomUUID();
			await repository.save(draft(idA));
			await repository.save(draft(idB));

			const originalCreate = WorkflowInstance.create.bind(WorkflowInstance);
			const programmerError = new TypeError("boom");
			const createSpy = vi
				.spyOn(WorkflowInstance, "create")
				.mockImplementation((props) => {
					if (props.entityId === idB) {
						throw programmerError;
					}
					return originalCreate(props);
				});

			try {
				await expect(repository.findByEntityIds([idA, idB], "HE")).rejects.toBe(
					programmerError,
				);
			} finally {
				createSpy.mockRestore();
			}
		});
	});

	describe("save", () => {
		it("inserts a new row on first save, resolving every field as given", async () => {
			const entityId = randomUUID();
			const instance = draft(entityId);

			const saved = await repository.save(instance);

			expect(fieldsOf(saved)).toEqual(fieldsOf(instance));
			const rows = await rowsFor(entityId, "HE");
			expect(rows).toHaveLength(1);
			expect(rows[0].status).toBe("DRAFT");
		});

		it("updates the existing row by id, persisting the instance's own updatedAt exactly, not a DB-generated value", async () => {
			const entityId = randomUUID();
			const createdAt = new Date("2020-01-01T00:00:00Z");
			const id = randomUUID();
			const original = WorkflowInstance.create({
				id,
				entityId,
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
				createdAt,
				updatedAt: createdAt,
			});
			await repository.save(original);

			const userId = await seedUser();
			const pastUpdatedAt = new Date("2021-06-15T12:00:00Z");
			const updated = WorkflowInstance.create({
				id,
				entityId,
				entityType: "HE",
				status: "SUBMITTED",
				submittedByUserId: userId,
				submittedAt: pastUpdatedAt,
				validatedByUserId: null,
				validatedAt: null,
				approvedByUserId: null,
				approvedAt: null,
				publishedByUserId: null,
				publishedAt: null,
				createdAt,
				updatedAt: pastUpdatedAt,
			});

			await repository.save(updated);

			const rows = await rowsFor(entityId, "HE");
			expect(rows).toHaveLength(1);
			expect(rows[0].status).toBe("SUBMITTED");
			expect(rows[0].updatedAt?.toISOString()).toBe(
				pastUpdatedAt.toISOString(),
			);
		});

		it("does not alter entityId, entityType, or createdAt on an update, even when the saved instance carries a different createdAt", async () => {
			const entityId = randomUUID();
			const id = randomUUID();
			const createdAt = new Date("2019-03-01T00:00:00Z");
			const original = WorkflowInstance.create({
				id,
				entityId,
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
				createdAt,
				updatedAt: createdAt,
			});
			await repository.save(original);

			const tamperedCreatedAt = new Date("2099-01-01T00:00:00Z");
			const tampered = WorkflowInstance.create({
				id,
				entityId,
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
				createdAt: tamperedCreatedAt,
				updatedAt: new Date("2020-01-01T00:00:00Z"),
			});

			const saved = await repository.save(tampered);

			// Proves save() resolves the re-read persisted row, not the un-persisted input: a
			// `save()` that returned `tampered` as-is would wrongly show the 2099 createdAt here.
			expect(saved.createdAt.toISOString()).toBe(createdAt.toISOString());
			const rows = await rowsFor(entityId, "HE");
			expect(rows[0].entityId).toBe(entityId);
			expect(rows[0].entityType).toBe("HE");
			expect(rows[0].createdAt?.toISOString()).toBe(createdAt.toISOString());
		});

		it("rejects with ConflictError when a unique-constraint violation on (entityId, entityType) occurs during insert", async () => {
			const entityId = randomUUID();
			await repository.save(draft(entityId));

			const conflicting = draft(entityId);

			await expect(repository.save(conflicting)).rejects.toThrow(ConflictError);
			const rows = await rowsFor(entityId, "HE");
			expect(rows).toHaveLength(1);
		});

		it("maps a foreign-key violation on an attribution user id to ValidationError, not ConflictError", async () => {
			const entityId = randomUUID();
			const now = new Date();
			const nonexistentUserId = randomUUID();
			const instance = WorkflowInstance.create({
				id: randomUUID(),
				entityId,
				entityType: "HE",
				status: "SUBMITTED",
				submittedByUserId: nonexistentUserId,
				submittedAt: now,
				validatedByUserId: null,
				validatedAt: null,
				approvedByUserId: null,
				approvedAt: null,
				publishedByUserId: null,
				publishedAt: null,
				createdAt: now,
				updatedAt: now,
			});

			await expect(repository.save(instance)).rejects.toBeInstanceOf(
				ValidationError,
			);
		});

		it("maps an invalid-input-syntax error (e.g. a malformed entityId) to ValidationError, not ConflictError", async () => {
			const now = new Date();
			const instance = WorkflowInstance.create({
				id: randomUUID(),
				entityId: "not-a-valid-uuid",
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
				createdAt: now,
				updatedAt: now,
			});

			await expect(repository.save(instance)).rejects.toBeInstanceOf(
				ValidationError,
			);
		});

		it("rejects two concurrent first-inserts for the same entity with exactly one success and one ConflictError", async () => {
			const entityId = randomUUID();
			const first = draft(entityId);
			const second = draft(entityId);

			const results = await Promise.allSettled([
				repository.save(first),
				repository.save(second),
			]);

			const fulfilled = results.filter((r) => r.status === "fulfilled");
			const rejected = results.filter((r) => r.status === "rejected");
			expect(fulfilled).toHaveLength(1);
			expect(rejected).toHaveLength(1);
			expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
				ConflictError,
			);

			const rows = await rowsFor(entityId, "HE");
			expect(rows).toHaveLength(1);
		});

		it("resolves both concurrent updates to the same existing row without error — last commit wins (characterizes DEF-024)", async () => {
			const entityId = randomUUID();
			const userId = await seedUser();
			const now = new Date();
			const submitted = draft(entityId, "HE", now).submit({ userId, now });
			await repository.save(submitted);

			const approveNow = new Date(now.getTime() + 1000);
			const approved = submitted.approve({ userId, now: approveNow });
			const revisionNow = new Date(now.getTime() + 2000);
			const revisionRequested = submitted.requestRevision({
				userId,
				now: revisionNow,
			});

			// PGlite serializes over one connection — issue order (approve, then revision) pins
			// which write lands last, so this characterizes last-write-wins deterministically.
			await Promise.all([
				repository.save(approved),
				repository.save(revisionRequested),
			]);

			const rows = await rowsFor(entityId, "HE");
			expect(rows).toHaveLength(1);
			expect(rows[0].status).toBe("REVISION_REQUESTED");
			expect(rows[0].updatedAt?.toISOString()).toBe(revisionNow.toISOString());
		});
	});

	describe("save — identity-mismatch guard", () => {
		it("rejects with ConflictError when an id is reused for a different entity, leaving the original row's identity unchanged", async () => {
			const originalEntityId = randomUUID();
			const original = draft(originalEntityId);
			await repository.save(original);

			const differentEntityId = randomUUID();
			const reused = WorkflowInstance.create({
				id: original.id,
				entityId: differentEntityId,
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
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(repository.save(reused)).rejects.toThrow(ConflictError);

			const rows = await dr
				.select()
				.from(workflowInstanceTable)
				.where(eq(workflowInstanceTable.id, original.id));
			expect(rows).toHaveLength(1);
			expect(rows[0].entityId).toBe(originalEntityId);
		});
	});

	describe("save — status transition round trips", () => {
		it("DRAFT to SUBMITTED persists the submitted pair, leaves every other attribution pair null", async () => {
			const entityId = randomUUID();
			const userId = await seedUser();
			const now = new Date();
			const created = draft(entityId, "HE", now);
			await repository.save(created);

			const submitted = created.submit({ userId, now });
			await repository.save(submitted);

			const found = await repository.findByEntity(entityId, "HE");
			expect(found?.status).toBe("SUBMITTED");
			expect(found?.submittedByUserId).toBe(userId);
			expect(found?.submittedAt?.toISOString()).toBe(now.toISOString());
			expect(found?.validatedByUserId).toBeNull();
			expect(found?.validatedAt).toBeNull();
			expect(found?.approvedByUserId).toBeNull();
			expect(found?.approvedAt).toBeNull();
			expect(found?.publishedByUserId).toBeNull();
			expect(found?.publishedAt).toBeNull();
		});

		it("validate-only stays SUBMITTED with the validator set, approval/publish pairs still null", async () => {
			const entityId = randomUUID();
			const userId = await seedUser();
			const validatorId = await seedUser();
			const now = new Date();
			const submitted = draft(entityId, "HE", now).submit({ userId, now });
			await repository.save(submitted);

			const validatedAt = new Date(now.getTime() + 1000);
			const validated = submitted.validate({
				userId: validatorId,
				now: validatedAt,
			});
			await repository.save(validated);

			const found = await repository.findByEntity(entityId, "HE");
			expect(found?.status).toBe("SUBMITTED");
			expect(found?.validatedByUserId).toBe(validatorId);
			expect(found?.validatedAt?.toISOString()).toBe(validatedAt.toISOString());
			expect(found?.approvedByUserId).toBeNull();
			expect(found?.approvedAt).toBeNull();
			expect(found?.publishedByUserId).toBeNull();
			expect(found?.publishedAt).toBeNull();
		});

		it("SUBMITTED to APPROVED persists the approved pair", async () => {
			const entityId = randomUUID();
			const userId = await seedUser();
			const approverId = await seedUser();
			const now = new Date();
			const submitted = draft(entityId, "HE", now).submit({ userId, now });
			await repository.save(submitted);

			const approvedAt = new Date(now.getTime() + 1000);
			const approved = submitted.approve({
				userId: approverId,
				now: approvedAt,
			});
			await repository.save(approved);

			const found = await repository.findByEntity(entityId, "HE");
			expect(found?.status).toBe("APPROVED");
			expect(found?.approvedByUserId).toBe(approverId);
			expect(found?.approvedAt?.toISOString()).toBe(approvedAt.toISOString());
		});

		it("a SUBMITTED to REVISION_REQUESTED to SUBMITTED round trip clears a previously-persisted validator back to null", async () => {
			const entityId = randomUUID();
			const userId = await seedUser();
			const validatorId = await seedUser();
			const now = new Date();
			const submitted = draft(entityId, "HE", now).submit({ userId, now });
			await repository.save(submitted);

			const validatedAt = new Date(now.getTime() + 1000);
			const validated = submitted.validate({
				userId: validatorId,
				now: validatedAt,
			});
			await repository.save(validated);

			const revisionAt = new Date(now.getTime() + 2000);
			const revisionRequested = validated.requestRevision({
				userId,
				now: revisionAt,
			});
			await repository.save(revisionRequested);

			const resubmitAt = new Date(now.getTime() + 3000);
			const resubmitted = revisionRequested.submit({
				userId,
				now: resubmitAt,
			});
			await repository.save(resubmitted);

			const found = await repository.findByEntity(entityId, "HE");
			expect(found?.status).toBe("SUBMITTED");
			expect(found?.validatedByUserId).toBeNull();
			expect(found?.validatedAt).toBeNull();
		});

		it("APPROVED to PUBLISHED backfills the validator only when it was not already set", async () => {
			const entityId = randomUUID();
			const userId = await seedUser();
			const approverId = await seedUser();
			const publisherId = await seedUser();
			const now = new Date();
			const submitted = draft(entityId, "HE", now).submit({ userId, now });
			await repository.save(submitted);
			const approvedAt = new Date(now.getTime() + 1000);
			const approved = submitted.approve({
				userId: approverId,
				now: approvedAt,
			});
			await repository.save(approved);

			const publishedAt = new Date(now.getTime() + 2000);
			const published = approved.publish({
				userId: publisherId,
				now: publishedAt,
			});
			await repository.save(published);

			const found = await repository.findByEntity(entityId, "HE");
			expect(found?.status).toBe("PUBLISHED");
			expect(found?.publishedByUserId).toBe(publisherId);
			expect(found?.publishedAt?.toISOString()).toBe(publishedAt.toISOString());
			expect(found?.validatedByUserId).toBe(publisherId);
			expect(found?.validatedAt?.toISOString()).toBe(publishedAt.toISOString());
		});

		it("APPROVED to PUBLISHED preserves an already-set validator's attribution, not the publisher's", async () => {
			const entityId = randomUUID();
			const userId = await seedUser();
			const validatorId = await seedUser();
			const approverId = await seedUser();
			const publisherId = await seedUser();
			const now = new Date();
			const submitted = draft(entityId, "HE", now).submit({ userId, now });
			await repository.save(submitted);
			const validatedAt = new Date(now.getTime() + 1000);
			const validated = submitted.validate({
				userId: validatorId,
				now: validatedAt,
			});
			await repository.save(validated);
			const approvedAt = new Date(now.getTime() + 2000);
			const approved = validated.approve({
				userId: approverId,
				now: approvedAt,
			});
			await repository.save(approved);

			const publishedAt = new Date(now.getTime() + 3000);
			const published = approved.publish({
				userId: publisherId,
				now: publishedAt,
			});
			await repository.save(published);

			const found = await repository.findByEntity(entityId, "HE");
			expect(found?.validatedByUserId).toBe(validatorId);
			expect(found?.validatedAt?.toISOString()).toBe(validatedAt.toISOString());
		});
	});

	describe("deleteByEntity", () => {
		it("deletes the matching row", async () => {
			const entityId = randomUUID();
			await repository.save(draft(entityId));

			await repository.deleteByEntity(entityId, "HE");

			await expect(repository.findByEntity(entityId, "HE")).resolves.toBeNull();
		});

		it("leaves a different entityType's row for the same entityId intact", async () => {
			const entityId = randomUUID();
			await repository.save(draft(entityId, "HE"));
			await repository.save(draft(entityId, "DE"));

			await repository.deleteByEntity(entityId, "HE");

			await expect(repository.findByEntity(entityId, "HE")).resolves.toBeNull();
			await expect(
				repository.findByEntity(entityId, "DE"),
			).resolves.not.toBeNull();
		});

		it("is a no-op, not throwing, when no matching row exists", async () => {
			await expect(
				repository.deleteByEntity(randomUUID(), "HE"),
			).resolves.toBeUndefined();
		});

		it("resolves both calls successfully for two concurrent deletes of the same row", async () => {
			const entityId = randomUUID();
			await repository.save(draft(entityId));

			await expect(
				Promise.all([
					repository.deleteByEntity(entityId, "HE"),
					repository.deleteByEntity(entityId, "HE"),
				]),
			).resolves.toEqual([undefined, undefined]);

			await expect(repository.findByEntity(entityId, "HE")).resolves.toBeNull();
		});
	});

	describe("no countryAccountsId filter", () => {
		it("returns a row regardless of which tenant's aggregate owns the referenced entity, with no tenant argument supplied anywhere", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();
			await repository.save(draft(hazardousEventId));

			const found = await repository.findByEntity(hazardousEventId, "HE");

			expect(found).not.toBeNull();
		});
	});
});
