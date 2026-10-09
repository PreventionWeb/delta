import { describe, expect, it } from "vitest";
import {
	WorkflowInstance,
	type EntityType,
} from "../../domain/WorkflowInstance";
import { ConflictError } from "~/shared/errors";
import type { IWorkflowRepository } from "./IWorkflowRepository";

class FakeWorkflowRepository implements IWorkflowRepository {
	private readonly store = new Map<string, WorkflowInstance>();
	// id -> owning entity key; detects an id reused for a different entity (mirrors the real
	// DrizzleWorkflowRepository's identity-mismatch guard, 5a design.md Decision 3).
	private readonly idOwner = new Map<string, string>();

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
		const entityKey = this.key(instance.entityId, instance.entityType);
		const owner = this.idOwner.get(instance.id);
		if (owner !== undefined && owner !== entityKey) {
			throw new ConflictError(
				"WorkflowInstance id already belongs to a different entity",
				{ id: instance.id },
			);
		}
		this.idOwner.set(instance.id, entityKey);
		this.store.set(entityKey, instance);
		return instance;
	}

	async deleteByEntity(
		entityId: string,
		entityType: EntityType,
	): Promise<void> {
		this.store.delete(this.key(entityId, entityType));
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

	it("save rejects with ConflictError when an id already belongs to a different entity, matching DrizzleWorkflowRepository's own identity-mismatch guard (5a Decision 3)", async () => {
		const repo = new FakeWorkflowRepository();
		await repo.save(makeInstance("id1", "wf-1"));

		await expect(repo.save(makeInstance("id2", "wf-1"))).rejects.toThrow(
			ConflictError,
		);
	});

	describe("deleteByEntity", () => {
		it("removes an existing WorkflowInstance", async () => {
			const repo = new FakeWorkflowRepository();
			await repo.save(makeInstance("id1", "wf-1"));

			await repo.deleteByEntity("id1", "HE");

			await expect(repo.findByEntity("id1", "HE")).resolves.toBeNull();
		});

		it("resolves normally, not throwing, for an entity with no existing instance", async () => {
			const repo = new FakeWorkflowRepository();

			await expect(
				repo.deleteByEntity("no-such-entity", "HE"),
			).resolves.toBeUndefined();
		});

		it("is idempotent across two sequential calls for the same entity", async () => {
			const repo = new FakeWorkflowRepository();
			await repo.save(makeInstance("id1", "wf-1"));

			await repo.deleteByEntity("id1", "HE");
			await repo.deleteByEntity("id1", "HE");

			await expect(repo.findByEntity("id1", "HE")).resolves.toBeNull();
		});
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
const _deleteByEntityArity: AssertEqual<
	Parameters<IWorkflowRepository["deleteByEntity"]>,
	[string, EntityType]
> = true;

void _findByEntityArity;
void _findByEntityIdsArity;
void _saveArity;
void _deleteByEntityArity;
