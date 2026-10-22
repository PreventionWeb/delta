import { describe, expect, it, vi } from "vitest";

import { WorkflowInstance } from "../../domain/WorkflowInstance";
import type { IWorkflowRepository } from "../ports/IWorkflowRepository";
import type { Tx } from "~/db.server";

import { InitializeWorkflowInstanceUseCase } from "./InitializeWorkflowInstance";

/** Per-test IWorkflowRepository double — only `insert` is exercised by this use case. */
function makeRepository(
	insertImpl?: (
		instance: WorkflowInstance,
		tx?: Tx,
	) => Promise<WorkflowInstance>,
): IWorkflowRepository {
	return {
		findByEntity: vi.fn(),
		findByEntityIds: vi.fn(),
		insert: insertImpl
			? vi.fn().mockImplementation(insertImpl)
			: vi.fn().mockImplementation((i: WorkflowInstance) => Promise.resolve(i)),
		update: vi.fn(),
		deleteByEntity: vi.fn(),
	};
}

describe("InitializeWorkflowInstanceUseCase", () => {
	it("builds and persists a DRAFT WorkflowInstance, returning the repository's resolved value", async () => {
		const persisted = WorkflowInstance.createDraft({
			id: "persisted-id",
			entityId: "entity-1",
			entityType: "HE",
			now: new Date("2026-01-01T00:00:00.000Z"),
		});
		const repository = makeRepository(() => Promise.resolve(persisted));
		const useCase = new InitializeWorkflowInstanceUseCase(repository);

		const result = await useCase.execute({
			entityId: "entity-1",
			entityType: "HE",
		});

		expect(repository.insert).toHaveBeenCalledTimes(1);
		const insertedInstance = vi.mocked(repository.insert).mock
			.calls[0][0] as WorkflowInstance;
		expect(insertedInstance.entityId).toBe("entity-1");
		expect(insertedInstance.entityType).toBe("HE");
		expect(insertedInstance.status).toBe("DRAFT");
		expect(insertedInstance.submittedByUserId).toBeNull();
		expect(insertedInstance.validatedByUserId).toBeNull();
		expect(insertedInstance.approvedByUserId).toBeNull();
		expect(insertedInstance.publishedByUserId).toBeNull();
		// Return value is the repository's resolved value, not the pre-insert instance.
		expect(result).toBe(persisted);
	});

	it("passes a caller-supplied tx through to insert() unmodified", async () => {
		const repository = makeRepository();
		const useCase = new InitializeWorkflowInstanceUseCase(repository);
		const tx = {} as Tx;

		await useCase.execute({ entityId: "entity-1", entityType: "HE", tx });

		expect(repository.insert).toHaveBeenCalledWith(expect.anything(), tx);
	});

	it("passes undefined as tx when the command omits it", async () => {
		const repository = makeRepository();
		const useCase = new InitializeWorkflowInstanceUseCase(repository);

		await useCase.execute({ entityId: "entity-1", entityType: "HE" });

		expect(repository.insert).toHaveBeenCalledWith(
			expect.anything(),
			undefined,
		);
	});

	it("generates a fresh id for each new instance", async () => {
		const repository = makeRepository();
		const useCase = new InitializeWorkflowInstanceUseCase(repository);

		await useCase.execute({ entityId: "entity-1", entityType: "HE" });
		await useCase.execute({ entityId: "entity-2", entityType: "HE" });

		const calls = vi.mocked(repository.insert).mock.calls;
		expect((calls[0][0] as WorkflowInstance).id).not.toBe(
			(calls[1][0] as WorkflowInstance).id,
		);
	});

	it("does not take an ILogger dependency — the single-argument constructor compiles and executes", async () => {
		const repository = makeRepository();
		const useCase = new InitializeWorkflowInstanceUseCase(repository);

		await expect(
			useCase.execute({ entityId: "entity-1", entityType: "HE" }),
		).resolves.toBeDefined();
	});

	describe("concurrent callers", () => {
		it("two concurrent calls for different entities both succeed independently", async () => {
			const repository = makeRepository();
			const useCase = new InitializeWorkflowInstanceUseCase(repository);

			const [a, b] = await Promise.all([
				useCase.execute({ entityId: "entity-1", entityType: "HE" }),
				useCase.execute({ entityId: "entity-2", entityType: "HE" }),
			]);

			expect(a.entityId).toBe("entity-1");
			expect(b.entityId).toBe("entity-2");
		});

		it("two concurrent calls for the same entity: one resolves, the other rejects with the simulated unique-constraint violation", async () => {
			const seenKeys = new Set<string>();
			const repository = makeRepository((instance) => {
				const key = `${instance.entityId}:${instance.entityType}`;
				if (seenKeys.has(key)) {
					return Promise.reject(
						new Error("duplicate key value violates unique constraint"),
					);
				}
				seenKeys.add(key);
				return Promise.resolve(instance);
			});
			const useCase = new InitializeWorkflowInstanceUseCase(repository);

			const results = await Promise.allSettled([
				useCase.execute({ entityId: "entity-1", entityType: "HE" }),
				useCase.execute({ entityId: "entity-1", entityType: "HE" }),
			]);

			const fulfilled = results.filter((r) => r.status === "fulfilled");
			const rejected = results.filter((r) => r.status === "rejected");
			expect(fulfilled).toHaveLength(1);
			expect(rejected).toHaveLength(1);
			expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(
				/unique constraint/,
			);
		});
	});
});
