import { describe, expect, it, vi } from "vitest";

import { WorkflowInstance } from "../../domain/WorkflowInstance";
import type { IWorkflowRepository } from "../ports/IWorkflowRepository";
import type { Tx } from "~/db.server";

import { GetWorkflowInstanceByEntityUseCase } from "./GetWorkflowInstanceByEntity";

/** Per-test IWorkflowRepository double — only `findByEntity` is exercised by this use case. */
function makeRepository(
	findByEntityImpl: (
		entityId: string,
		entityType: string,
	) => Promise<WorkflowInstance | null>,
): IWorkflowRepository {
	return {
		findByEntity: vi.fn().mockImplementation(findByEntityImpl),
		findByEntityIds: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
		deleteByEntity: vi.fn(),
	};
}

describe("GetWorkflowInstanceByEntityUseCase", () => {
	it("returns the existing WorkflowInstance for the given entity", async () => {
		const instance = WorkflowInstance.createDraft({
			id: "instance-1",
			entityId: "entity-1",
			entityType: "HE",
			now: new Date("2026-01-01T00:00:00.000Z"),
		});
		const repository = makeRepository(() => Promise.resolve(instance));
		const useCase = new GetWorkflowInstanceByEntityUseCase(repository);

		const result = await useCase.execute({
			entityId: "entity-1",
			entityType: "HE",
		});

		expect(result).toBe(instance);
		expect(repository.findByEntity).toHaveBeenCalledWith(
			"entity-1",
			"HE",
			undefined,
		);
	});

	it("returns null, not an error, when no WorkflowInstance exists", async () => {
		const repository = makeRepository(() => Promise.resolve(null));
		const useCase = new GetWorkflowInstanceByEntityUseCase(repository);

		await expect(
			useCase.execute({ entityId: "no-such-entity", entityType: "HE" }),
		).resolves.toBeNull();
	});

	describe("concurrent callers", () => {
		it("two concurrent reads for the same entity both resolve, each firing its own query (no coalescing)", async () => {
			const instance = WorkflowInstance.createDraft({
				id: "instance-1",
				entityId: "entity-1",
				entityType: "HE",
				now: new Date("2026-01-01T00:00:00.000Z"),
			});
			const repository = makeRepository(() => Promise.resolve(instance));
			const useCase = new GetWorkflowInstanceByEntityUseCase(repository);

			const [a, b] = await Promise.all([
				useCase.execute({ entityId: "entity-1", entityType: "HE" }),
				useCase.execute({ entityId: "entity-1", entityType: "HE" }),
			]);

			expect(a).toBe(instance);
			expect(b).toBe(instance);
			expect(repository.findByEntity).toHaveBeenCalledTimes(2);
		});
	});
});

describe("GetWorkflowInstanceByEntityUseCase with tx (ca-he-csv-migration NOD-12)", () => {
	it("passes the caller's tx to findByEntity, so an instance inserted earlier in it is returned", async () => {
		const instance = WorkflowInstance.createDraft({
			id: "instance-tx",
			entityId: "entity-tx",
			entityType: "HE",
			now: new Date("2026-01-01T00:00:00.000Z"),
		});
		const tx = { marker: "tx" } as unknown as Tx;
		const repository = makeRepository((_id, _type) =>
			Promise.resolve(instance),
		);
		const useCase = new GetWorkflowInstanceByEntityUseCase(repository);

		const result = await useCase.execute({
			entityId: "entity-tx",
			entityType: "HE",
			tx,
		});

		expect(result).toBe(instance);
		expect(repository.findByEntity).toHaveBeenCalledWith("entity-tx", "HE", tx);
	});

	it("concurrent calls without tx each resolve independently", async () => {
		const repository = makeRepository((entityId) =>
			Promise.resolve(
				WorkflowInstance.createDraft({
					id: `instance-${entityId}`,
					entityId,
					entityType: "HE",
					now: new Date("2026-01-01T00:00:00.000Z"),
				}),
			),
		);
		const useCase = new GetWorkflowInstanceByEntityUseCase(repository);

		const [first, second] = await Promise.all([
			useCase.execute({ entityId: "e-1", entityType: "HE" }),
			useCase.execute({ entityId: "e-1", entityType: "HE" }),
		]);

		expect(first?.entityId).toBe("e-1");
		expect(second?.entityId).toBe("e-1");
	});
});
