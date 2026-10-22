import { describe, expect, it, vi } from "vitest";

import { WorkflowInstance } from "../../domain/WorkflowInstance";
import type { IWorkflowRepository } from "../ports/IWorkflowRepository";

import { ListWorkflowInstancesByEntityIdsUseCase } from "./ListWorkflowInstancesByEntityIds";

/** Per-test IWorkflowRepository double — only `findByEntityIds` is exercised by this use case. */
function makeRepository(
	findByEntityIdsImpl: (
		entityIds: string[],
		entityType: string,
	) => Promise<WorkflowInstance[]>,
): IWorkflowRepository {
	return {
		findByEntity: vi.fn(),
		findByEntityIds: vi.fn().mockImplementation(findByEntityIdsImpl),
		insert: vi.fn(),
		update: vi.fn(),
		deleteByEntity: vi.fn(),
	};
}

function instance(entityId: string): WorkflowInstance {
	return WorkflowInstance.createDraft({
		id: `instance-for-${entityId}`,
		entityId,
		entityType: "HE",
		now: new Date("2026-01-01T00:00:00.000Z"),
	});
}

describe("ListWorkflowInstancesByEntityIdsUseCase", () => {
	it("returns instances for entities that have one, omitting those that don't", async () => {
		const existing = [instance("entity-1"), instance("entity-2")];
		const repository = makeRepository(() => Promise.resolve(existing));
		const useCase = new ListWorkflowInstancesByEntityIdsUseCase(repository);

		const result = await useCase.execute({
			entityIds: ["entity-1", "entity-2", "entity-3"],
			entityType: "HE",
		});

		expect(result).toBe(existing);
		expect(repository.findByEntityIds).toHaveBeenCalledWith(
			["entity-1", "entity-2", "entity-3"],
			"HE",
		);
	});

	it("resolves to an empty array for an empty entityIds input, without throwing", async () => {
		const repository = makeRepository(() => Promise.resolve([]));
		const useCase = new ListWorkflowInstancesByEntityIdsUseCase(repository);

		await expect(
			useCase.execute({ entityIds: [], entityType: "HE" }),
		).resolves.toEqual([]);
	});

	describe("concurrent callers", () => {
		it("two concurrent batched reads with overlapping entity ids each resolve to their own requested subset", async () => {
			const all = [instance("entity-1"), instance("entity-2")];
			const repository = makeRepository((entityIds) =>
				Promise.resolve(all.filter((i) => entityIds.includes(i.entityId))),
			);
			const useCase = new ListWorkflowInstancesByEntityIdsUseCase(repository);

			const [a, b] = await Promise.all([
				useCase.execute({ entityIds: ["entity-1"], entityType: "HE" }),
				useCase.execute({
					entityIds: ["entity-1", "entity-2"],
					entityType: "HE",
				}),
			]);

			expect(a.map((i) => i.entityId)).toEqual(["entity-1"]);
			expect(b.map((i) => i.entityId)).toEqual(["entity-1", "entity-2"]);
			expect(repository.findByEntityIds).toHaveBeenCalledTimes(2);
		});
	});
});
