import { describe, expect, it } from "vitest";
import {
	WorkflowInstance,
	type EntityType,
} from "../../domain/WorkflowInstance";
import type { IWorkflowRepository } from "./IWorkflowRepository";

class FakeWorkflowRepository implements IWorkflowRepository {
	private readonly store = new Map<string, WorkflowInstance>();

	private key(entityId: string, entityType: string): string {
		return `${entityType}:${entityId}`;
	}

	async findByEntity(entityId: string, entityType: EntityType) {
		return this.store.get(this.key(entityId, entityType)) ?? null;
	}

	async findByEntityIds(entityIds: string[], entityType: EntityType) {
		return entityIds
			.map((id) => this.store.get(this.key(id, entityType)))
			.filter((instance): instance is WorkflowInstance => instance != null);
	}

	async save(instance: WorkflowInstance) {
		this.store.set(this.key(instance.entityId, instance.entityType), instance);
		return instance;
	}
}

function makeInstance(entityId: string, id: string): WorkflowInstance {
	return WorkflowInstance.create({
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
		createdAt: new Date(),
		updatedAt: new Date(),
	});
}

describe("IWorkflowRepository conformance", () => {
	it("findByEntity resolves null, not a thrown error, when no instance exists", async () => {
		const repo = new FakeWorkflowRepository();

		await expect(repo.findByEntity("missing-id", "HE")).resolves.toBeNull();
	});

	it("findByEntityIds returns only the instances that exist, omitting a missing one in the middle", async () => {
		const repo = new FakeWorkflowRepository();
		await repo.save(makeInstance("id1", "wf-1"));
		// id2 deliberately has no saved instance — the middle id, not the last, so an
		// index-aligned or truncate-on-first-miss implementation bug would surface here.
		await repo.save(makeInstance("id3", "wf-3"));

		const result = await repo.findByEntityIds(["id1", "id2", "id3"], "HE");

		expect(result.map((instance) => instance.entityId)).toEqual(["id1", "id3"]);
	});
});

// Tuple equality (not plain assignability) so a dropped/added param fails to compile.
type AssertEqual<A, B> = A extends B ? (B extends A ? true : never) : never;

const _findByEntityArity: AssertEqual<
	Parameters<IWorkflowRepository["findByEntity"]>,
	[string, EntityType]
> = true;
const _findByEntityIdsArity: AssertEqual<
	Parameters<IWorkflowRepository["findByEntityIds"]>,
	[string[], EntityType]
> = true;
const _saveArity: AssertEqual<
	Parameters<IWorkflowRepository["save"]>,
	[WorkflowInstance]
> = true;

void _findByEntityArity;
void _findByEntityIdsArity;
void _saveArity;
