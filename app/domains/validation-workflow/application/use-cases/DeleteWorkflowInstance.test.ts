import { describe, expect, it, vi } from "vitest";

import type { IWorkflowRepository } from "../ports/IWorkflowRepository";
import type { Tx } from "~/db.server";

import { DeleteWorkflowInstanceUseCase } from "./DeleteWorkflowInstance";

/** Per-test IWorkflowRepository double — only `deleteByEntity` is exercised by this use case. */
function makeRepository(
	deleteByEntityImpl?: (
		entityId: string,
		entityType: string,
		tx?: Tx,
	) => Promise<void>,
): IWorkflowRepository {
	return {
		findByEntity: vi.fn(),
		findByEntityIds: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
		deleteByEntity: deleteByEntityImpl
			? vi.fn().mockImplementation(deleteByEntityImpl)
			: vi.fn().mockResolvedValue(undefined),
	};
}

describe("DeleteWorkflowInstanceUseCase", () => {
	it("deletes the WorkflowInstance for the given entity exactly once", async () => {
		const repository = makeRepository();
		const useCase = new DeleteWorkflowInstanceUseCase(repository);

		await useCase.execute({ entityId: "entity-1", entityType: "HE" });

		expect(repository.deleteByEntity).toHaveBeenCalledTimes(1);
		expect(repository.deleteByEntity).toHaveBeenCalledWith(
			"entity-1",
			"HE",
			undefined,
		);
	});

	it("resolves normally when no matching instance exists (idempotent)", async () => {
		const repository = makeRepository();
		const useCase = new DeleteWorkflowInstanceUseCase(repository);

		await expect(
			useCase.execute({ entityId: "no-such-entity", entityType: "HE" }),
		).resolves.toBeUndefined();
	});

	it("passes a caller-supplied tx through to deleteByEntity() unmodified", async () => {
		const repository = makeRepository();
		const useCase = new DeleteWorkflowInstanceUseCase(repository);
		const tx = {} as Tx;

		await useCase.execute({ entityId: "entity-1", entityType: "HE", tx });

		expect(repository.deleteByEntity).toHaveBeenCalledWith(
			"entity-1",
			"HE",
			tx,
		);
	});

	it("passes undefined as tx when the command omits it", async () => {
		const repository = makeRepository();
		const useCase = new DeleteWorkflowInstanceUseCase(repository);

		await useCase.execute({ entityId: "entity-1", entityType: "HE" });

		expect(repository.deleteByEntity).toHaveBeenCalledWith(
			"entity-1",
			"HE",
			undefined,
		);
	});

	describe("concurrent callers", () => {
		it("two concurrent deletes for the same entity both resolve successfully", async () => {
			const repository = makeRepository();
			const useCase = new DeleteWorkflowInstanceUseCase(repository);

			const results = await Promise.allSettled([
				useCase.execute({ entityId: "entity-1", entityType: "HE" }),
				useCase.execute({ entityId: "entity-1", entityType: "HE" }),
			]);

			expect(results.every((r) => r.status === "fulfilled")).toBe(true);
		});
	});
});
