import "../../db/setup";
import { randomUUID } from "crypto";
import { and, eq, TransactionRollbackError } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { dr, type Tx } from "~/db.server";
import { auditLogsTable } from "~/drizzle/schema/auditLogsTable";
import { DrizzleWorkflowRepository } from "~/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server";
import { workflowNotificationTable } from "~/domains/validation-workflow/infrastructure/workflowNotificationTable";
import {
	WorkflowInstance,
	type Status,
} from "~/domains/validation-workflow/domain/WorkflowInstance";
import {
	ApplyImportedWorkflowStatusUseCase,
	type ImportedWorkflowStatus,
} from "~/domains/validation-workflow/application/use-cases/ApplyImportedWorkflowStatus";
import { STATUS_CHANGE_NOT_SUPPORTED } from "~/domains/validation-workflow/application/errors/WorkflowInstanceErrors";
import { DrizzleAuditLogAdapter } from "~/domains/shared/audit-log/infrastructure/DrizzleAuditLogAdapter.server";
import {
	AuthorizationError,
	ConflictError,
	ValidationError,
} from "~/shared/errors";
import {
	seedHazardousEvent,
	seedUser,
} from "../../db/models/hazardousEventTestHelpers";

const T0 = new Date("2026-01-01T00:00:00Z");

const workflowRepository = new DrizzleWorkflowRepository(dr);
const auditLogAdapter = new DrizzleAuditLogAdapter(dr);
const useCase = new ApplyImportedWorkflowStatusUseCase(
	workflowRepository,
	auditLogAdapter,
);

let earlierUserId: string;

beforeAll(async () => {
	// Warms PGlite and the adapter modules once, outside any per-test timeout.
	earlierUserId = await seedUser();
}, 60_000);

/** Builds an instance at `status` through the domain's own transitions, so it is a valid row. */
function instanceAt(entityId: string, status: Status): WorkflowInstance {
	const draft = WorkflowInstance.createDraft({
		id: randomUUID(),
		entityId,
		entityType: "HE",
		now: T0,
	});
	const params = { userId: earlierUserId, now: T0 };
	switch (status) {
		case "DRAFT":
			return draft;
		case "SUBMITTED":
			return draft.submit(params);
		case "REVISION_REQUESTED":
			return draft.submit(params).requestRevision(params);
		case "APPROVED":
			return draft.directValidate(params);
		case "PUBLISHED":
			return draft.directPublish(params);
		case "REJECTED":
			throw new Error("REJECTED is unreachable in CA (DEF-022)");
	}
}

/** A real hazardous_event with a committed instance at `status`, plus an acting user. */
async function seedEntity(status: Status) {
	const { id: entityId, countryAccountsId: tenantId } =
		await seedHazardousEvent();
	const seeded = await workflowRepository.insert(instanceAt(entityId, status));
	const actingUserId = await seedUser();
	return { entityId, tenantId, actingUserId, seeded };
}

function command(
	seed: { entityId: string; tenantId: string; actingUserId: string },
	targetStatus: ImportedWorkflowStatus,
	tx: Tx,
	actingUserRole: string | null = "admin",
) {
	return {
		entityId: seed.entityId,
		entityType: "HE" as const,
		tenantId: seed.tenantId,
		targetStatus,
		actingUserId: seed.actingUserId,
		actingUserRole,
		tx,
	};
}

async function storedInstance(entityId: string): Promise<WorkflowInstance> {
	const found = await workflowRepository.findByEntity(entityId, "HE");
	if (found === null) {
		throw new Error(`no workflow_instance for ${entityId}`);
	}
	return found;
}

async function auditRowsFor(entityId: string) {
	return dr
		.select()
		.from(auditLogsTable)
		.where(
			and(
				eq(auditLogsTable.recordId, entityId),
				eq(auditLogsTable.action, "Workflow status imported"),
			),
		);
}

async function notificationRowsFor(instanceId: string) {
	return dr
		.select()
		.from(workflowNotificationTable)
		.where(eq(workflowNotificationTable.instanceId, instanceId));
}

/** Rolls back `fn`'s caller transaction, swallowing only Drizzle's own rollback signal. */
async function runAndRollBack(fn: (outer: Tx) => Promise<void>): Promise<void> {
	try {
		await dr.transaction(async (outer) => {
			await fn(outer);
			outer.rollback();
		});
	} catch (err) {
		if (!(err instanceof TransactionRollbackError)) {
			throw err;
		}
	}
}

/** Asserts the instance and its audit trail are exactly as seeded. */
async function expectUnchanged(seed: {
	entityId: string;
	seeded: WorkflowInstance;
}): Promise<void> {
	const after = await storedInstance(seed.entityId);
	expect(after.status).toBe(seed.seeded.status);
	expect(after.updatedAt.getTime()).toBe(seed.seeded.updatedAt.getTime());
	expect(await auditRowsFor(seed.entityId)).toHaveLength(0);
}

describe("ApplyImportedWorkflowStatusUseCase (ca-he-csv-migration D12)", () => {
	describe("Requirement: moves a new instance to an imported status through the domain's own transitions", () => {
		it("Scenario: Import as published -- from DRAFT, PUBLISHED with validatedBy = publishedBy = U and both times equal", async () => {
			const seed = await seedEntity("DRAFT");

			await dr.transaction(async (tx) => {
				await useCase.execute(command(seed, "PUBLISHED", tx));
			});

			const after = await storedInstance(seed.entityId);
			expect(after.status).toBe("PUBLISHED");
			expect(after.validatedByUserId).toBe(seed.actingUserId);
			expect(after.publishedByUserId).toBe(seed.actingUserId);
			expect(after.validatedAt).not.toBeNull();
			expect(after.validatedAt?.getTime()).toBe(after.publishedAt?.getTime());
			expect(after.updatedAt.getTime()).toBe(after.publishedAt?.getTime());
			expect(after.submittedByUserId).toBeNull();
		});

		it("Scenario: Import as published -- one audit row is written in tx with action, tenant and old/new status", async () => {
			const seed = await seedEntity("DRAFT");

			await dr.transaction(async (tx) => {
				await useCase.execute(command(seed, "PUBLISHED", tx));
				// Visible on tx before commit: the audit write used the caller's tx.
				const inTx = await tx
					.select()
					.from(auditLogsTable)
					.where(eq(auditLogsTable.recordId, seed.entityId));
				expect(inTx).toHaveLength(1);
			});

			const rows = await auditRowsFor(seed.entityId);
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				tableName: "hazardous_event",
				recordId: seed.entityId,
				userId: seed.actingUserId,
				action: "Workflow status imported",
				countryAccountsId: seed.tenantId,
				oldValues: { status: "DRAFT" },
				newValues: { status: "PUBLISHED" },
			});
		});

		it("Scenario: Import as needs revision -- from DRAFT, REVISION_REQUESTED with submittedBy = U and the approved and published pairs null", async () => {
			const seed = await seedEntity("DRAFT");

			await dr.transaction(async (tx) => {
				await useCase.execute(command(seed, "REVISION_REQUESTED", tx));
			});

			const after = await storedInstance(seed.entityId);
			expect(after.status).toBe("REVISION_REQUESTED");
			expect(after.submittedByUserId).toBe(seed.actingUserId);
			expect(after.submittedAt).not.toBeNull();
			// One `now` per call (NOD-1): submit and requestRevision share it.
			expect(after.updatedAt.getTime()).toBe(after.submittedAt?.getTime());
			expect(after.approvedByUserId).toBeNull();
			expect(after.approvedAt).toBeNull();
			expect(after.publishedByUserId).toBeNull();
			expect(after.publishedAt).toBeNull();
		});

		it.each(["DRAFT", "REVISION_REQUESTED"] as const)(
			"table row SUBMITTED from %s -- submit: submittedBy = U, approved and published pairs null",
			async (from) => {
				const seed = await seedEntity(from);

				await dr.transaction(async (tx) => {
					await useCase.execute(command(seed, "SUBMITTED", tx));
				});

				const after = await storedInstance(seed.entityId);
				expect(after.status).toBe("SUBMITTED");
				expect(after.submittedByUserId).toBe(seed.actingUserId);
				expect(after.submittedAt?.getTime()).toBe(after.updatedAt.getTime());
				expect(after.approvedByUserId).toBeNull();
				expect(after.publishedByUserId).toBeNull();
				expect(await auditRowsFor(seed.entityId)).toHaveLength(1);
			},
		);

		it.each(["DRAFT", "REVISION_REQUESTED"] as const)(
			"table row APPROVED from %s -- directValidate: validatedBy = U, published pair null",
			async (from) => {
				const seed = await seedEntity(from);

				await dr.transaction(async (tx) => {
					await useCase.execute(command(seed, "APPROVED", tx));
				});

				const after = await storedInstance(seed.entityId);
				expect(after.status).toBe("APPROVED");
				expect(after.validatedByUserId).toBe(seed.actingUserId);
				expect(after.validatedAt?.getTime()).toBe(after.updatedAt.getTime());
				expect(after.publishedByUserId).toBeNull();
				expect(after.publishedAt).toBeNull();
				expect(await auditRowsFor(seed.entityId)).toHaveLength(1);
			},
		);

		it("table row PUBLISHED from REVISION_REQUESTED -- directPublish: validatedBy = publishedBy = U, equal times", async () => {
			const seed = await seedEntity("REVISION_REQUESTED");

			await dr.transaction(async (tx) => {
				await useCase.execute(command(seed, "PUBLISHED", tx));
			});

			const after = await storedInstance(seed.entityId);
			expect(after.status).toBe("PUBLISHED");
			expect(after.validatedByUserId).toBe(seed.actingUserId);
			expect(after.publishedByUserId).toBe(seed.actingUserId);
			expect(after.validatedAt?.getTime()).toBe(after.publishedAt?.getTime());
			expect(await auditRowsFor(seed.entityId)).toHaveLength(1);
		});

		it.each([
			"DRAFT",
			"SUBMITTED",
			"REVISION_REQUESTED",
			"APPROVED",
			"PUBLISHED",
		] as const)(
			"a target equal to the current status is a no-op from %s -- nothing saved, no audit row",
			async (status) => {
				const seed = await seedEntity(status);

				const result = await dr.transaction((tx) =>
					useCase.execute(command(seed, status, tx)),
				);

				expect(result.status).toBe(status);
				await expectUnchanged(seed);
			},
		);

		it("Scenario: Unsupported change -- PUBLISHED to DRAFT throws ConflictError with reason status_change_not_supported and nothing is saved", async () => {
			const seed = await seedEntity("PUBLISHED");

			let caught: unknown;
			await dr.transaction(async (tx) => {
				caught = await useCase
					.execute(command(seed, "DRAFT", tx))
					.catch((err: unknown) => err);
			});

			expect(caught).toBeInstanceOf(ConflictError);
			expect((caught as ConflictError).context?.reason).toBe(
				STATUS_CHANGE_NOT_SUPPORTED,
			);
			expect(STATUS_CHANGE_NOT_SUPPORTED).toBe("status_change_not_supported");
			await expectUnchanged(seed);
		});

		it.each([
			["REVISION_REQUESTED", "DRAFT"],
			["SUBMITTED", "PUBLISHED"],
			["APPROVED", "PUBLISHED"],
			["PUBLISHED", "APPROVED"],
		] as const)(
			"any other combination (%s to %s) throws ConflictError status_change_not_supported and saves nothing",
			async (from, target) => {
				const seed = await seedEntity(from);

				let caught: unknown;
				await dr.transaction(async (tx) => {
					caught = await useCase
						.execute(command(seed, target, tx))
						.catch((err: unknown) => err);
				});

				expect(caught).toBeInstanceOf(ConflictError);
				expect((caught as ConflictError).context?.reason).toBe(
					"status_change_not_supported",
				);
				await expectUnchanged(seed);
			},
		);

		it("REJECTED must not be accepted as a target (DEF-022) -- rejects and saves nothing", async () => {
			const seed = await seedEntity("DRAFT");

			await dr.transaction(async (tx) => {
				await expect(
					useCase.execute({
						...command(seed, "DRAFT", tx),
						// @ts-expect-error REJECTED is excluded from ImportedWorkflowStatus; a runtime caller could still send it.
						targetStatus: "REJECTED",
					}),
				).rejects.toBeInstanceOf(ValidationError);
			});

			await expectUnchanged(seed);
		});

		it("a failed audit write rejects rather than being tolerated", async () => {
			const seed = await seedEntity("DRAFT");
			const recordSpy = vi
				.spyOn(auditLogAdapter, "record")
				.mockRejectedValueOnce(new Error("audit-down"));

			try {
				await runAndRollBack(async (tx) => {
					await expect(
						useCase.execute(command(seed, "PUBLISHED", tx)),
					).rejects.toThrow("audit-down");
				});
			} finally {
				recordSpy.mockRestore();
			}

			await expectUnchanged(seed);
		});
	});

	describe("Requirement: imported statuses never notify and require the admin role", () => {
		it("Scenario: A non-admin import of a validated status is refused -- data-collector with APPROVED throws AuthorizationError and the instance is unchanged", async () => {
			const seed = await seedEntity("DRAFT");

			await dr.transaction(async (tx) => {
				await expect(
					useCase.execute(command(seed, "APPROVED", tx, "data-collector")),
				).rejects.toBeInstanceOf(AuthorizationError);
			});

			await expectUnchanged(seed);
		});

		it.each(["SUBMITTED", "REVISION_REQUESTED", "PUBLISHED"] as const)(
			"a non-admin (data-collector) import of %s is refused with AuthorizationError before any write",
			async (target) => {
				const seed = await seedEntity("DRAFT");

				await dr.transaction(async (tx) => {
					await expect(
						useCase.execute(command(seed, target, tx, "data-collector")),
					).rejects.toBeInstanceOf(AuthorizationError);
				});

				await expectUnchanged(seed);
			},
		);

		it("a missing role with a non-DRAFT target is refused with AuthorizationError", async () => {
			const seed = await seedEntity("DRAFT");

			await dr.transaction(async (tx) => {
				await expect(
					useCase.execute(command(seed, "SUBMITTED", tx, null)),
				).rejects.toBeInstanceOf(AuthorizationError);
			});

			await expectUnchanged(seed);
		});

		it("a DRAFT target is allowed for a non-admin -- resolves as a no-op from DRAFT", async () => {
			const seed = await seedEntity("DRAFT");

			const result = await dr.transaction((tx) =>
				useCase.execute(command(seed, "DRAFT", tx, "data-collector")),
			);

			expect(result.status).toBe("DRAFT");
			await expectUnchanged(seed);
		});

		it("a DRAFT target from REVISION_REQUESTED for a non-admin fails on the transition, not the role -- ConflictError", async () => {
			const seed = await seedEntity("REVISION_REQUESTED");

			await dr.transaction(async (tx) => {
				await expect(
					useCase.execute(command(seed, "DRAFT", tx, "data-collector")),
				).rejects.toBeInstanceOf(ConflictError);
			});

			await expectUnchanged(seed);
		});

		it.each(["SUBMITTED", "REVISION_REQUESTED"] as const)(
			"Scenario: Submitting on import sends no email -- target %s leaves no workflow_notification row",
			async (target) => {
				const seed = await seedEntity("DRAFT");

				await dr.transaction(async (tx) => {
					await useCase.execute(command(seed, target, tx));
				});

				expect((await storedInstance(seed.entityId)).status).toBe(target);
				expect(await notificationRowsFor(seed.seeded.id)).toHaveLength(0);
			},
		);
	});

	describe("Requirement: the status change rolls back with the caller's transaction", () => {
		it("Scenario: Rollback undoes the imported status -- still DRAFT and no audit row", async () => {
			const seed = await seedEntity("DRAFT");

			await runAndRollBack(async (outer) => {
				await useCase.execute(command(seed, "PUBLISHED", outer));
				// Proves the change happened on `outer` before the rollback.
				const inTx = await workflowRepository.findByEntity(
					seed.entityId,
					"HE",
					outer,
				);
				expect(inTx?.status).toBe("PUBLISHED");
			});

			const after = await storedInstance(seed.entityId);
			expect(after.status).toBe("DRAFT");
			expect(after.validatedByUserId).toBeNull();
			expect(after.publishedByUserId).toBeNull();
			expect(await auditRowsFor(seed.entityId)).toHaveLength(0);
		});

		it("sees an instance inserted earlier in the same caller transaction", async () => {
			const { id: entityId, countryAccountsId: tenantId } =
				await seedHazardousEvent();
			const actingUserId = await seedUser();

			await dr.transaction(async (tx) => {
				await workflowRepository.insert(instanceAt(entityId, "DRAFT"), tx);
				const saved = await useCase.execute(
					command({ entityId, tenantId, actingUserId }, "APPROVED", tx),
				);
				expect(saved.status).toBe("APPROVED");
			});

			expect((await storedInstance(entityId)).status).toBe("APPROVED");
		});
	});
});
