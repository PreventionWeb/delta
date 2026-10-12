import { describe, expect, it } from "vitest";
import {
	WorkflowInstance,
	type EntityType,
} from "../../domain/WorkflowInstance";
import { ConcurrentModificationError, ConflictError } from "~/shared/errors";
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

	async insert(instance: WorkflowInstance) {
		const entityKey = this.key(instance.entityId, instance.entityType);
		const owner = this.idOwner.get(instance.id);
		if (owner !== undefined && owner !== entityKey) {
			throw new ConflictError(
				"WorkflowInstance id already belongs to a different entity",
				{ id: instance.id },
			);
		}
		if (this.store.has(entityKey)) {
			// insert() MUST NOT silently update an existing row (workflow-repository-port spec) —
			// mirrors the real adapter's UNIQUE(entityId, entityType) constraint violation.
			throw new ConflictError(
				"WorkflowInstance already exists for this entityId/entityType",
				{ entityId: instance.entityId, entityType: instance.entityType },
			);
		}
		this.idOwner.set(instance.id, entityKey);
		this.store.set(entityKey, instance);
		return instance;
	}

	/** In-memory equality against the stored instance's updatedAt — sufficient for interface
	 * conformance; the real conditional-SQL behavior is DrizzleWorkflowRepository's own concern.*/
	async update(instance: WorkflowInstance, expectedUpdatedAt: Date) {
		const entityKey = this.key(instance.entityId, instance.entityType);
		const owner = this.idOwner.get(instance.id);

		// No row known for this id at all — matches the real adapter's "no row" diagnostic cause.
		if (owner === undefined) {
			throw new ConcurrentModificationError(
				"WorkflowInstance no longer exists for this entityId/entityType",
				{ entityId: instance.entityId, entityType: instance.entityType },
			);
		}
		if (owner !== entityKey) {
			throw new ConflictError(
				"WorkflowInstance id already belongs to a different entity",
				{ id: instance.id },
			);
		}

		const current = this.store.get(entityKey);
		if (
			current === undefined ||
			current.updatedAt.getTime() !== expectedUpdatedAt.getTime()
		) {
			// Covers both the delete-race (idOwner isn't cleared) and the ordinary stale-write case.
			throw new ConcurrentModificationError(
				"WorkflowInstance has been modified since it was read",
				{ entityId: instance.entityId, entityType: instance.entityType },
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
		await repo.insert(makeInstance("id1", "wf-1"));
		// id2 deliberately has no saved instance — the middle id, not the last, so an
		// index-aligned or truncate-on-first-miss implementation bug would surface here.
		await repo.insert(makeInstance("id3", "wf-3"));

		const result = await repo.findByEntityIds(["id1", "id2", "id3"], "HE");

		expect(result.map((instance) => instance.entityId)).toEqual(["id1", "id3"]);
	});

	it("insert rejects with ConflictError when an id already belongs to a different entity, matching DrizzleWorkflowRepository's own identity-mismatch guard (5a Decision 3)", async () => {
		const repo = new FakeWorkflowRepository();
		await repo.insert(makeInstance("id1", "wf-1"));

		await expect(repo.insert(makeInstance("id2", "wf-1"))).rejects.toThrow(
			ConflictError,
		);
	});

	it("insert rejects with ConflictError when an instance already exists for the same entityId/entityType, never silently updating it", async () => {
		const repo = new FakeWorkflowRepository();
		const original = makeInstance("id1", "wf-1");
		await repo.insert(original);

		await expect(repo.insert(makeInstance("id1", "wf-2"))).rejects.toThrow(
			ConflictError,
		);
		await expect(repo.findByEntity("id1", "HE")).resolves.toBe(original);
	});

	describe("update", () => {
		it("rejects with ConcurrentModificationError when expectedUpdatedAt no longer matches the stored instance (stale write)", async () => {
			const repo = new FakeWorkflowRepository();
			const original = makeInstance("id1", "wf-1");
			await repo.insert(original);
			// Both callers read `original` and race to submit() from the same DRAFT snapshot.
			const winner = original.submit({
				userId: "user-1",
				now: new Date(original.updatedAt.getTime() + 1000),
			});
			await repo.update(winner, original.updatedAt);

			const stale = original.submit({
				userId: "user-2",
				now: new Date(original.updatedAt.getTime() + 2000),
			});
			const err = await repo
				.update(stale, original.updatedAt)
				.catch((e: unknown) => e);

			expect(err).toBeInstanceOf(ConcurrentModificationError);
		});

		it("rejects with ConcurrentModificationError, not resurrecting the row, when deleteByEntity already removed it", async () => {
			const repo = new FakeWorkflowRepository();
			const original = makeInstance("id1", "wf-1");
			await repo.insert(original);
			await repo.deleteByEntity("id1", "HE");

			const stale = original.submit({
				userId: "user-1",
				now: new Date(original.updatedAt.getTime() + 1000),
			});
			const err = await repo
				.update(stale, original.updatedAt)
				.catch((e: unknown) => e);

			expect(err).toBeInstanceOf(ConcurrentModificationError);
			await expect(repo.findByEntity("id1", "HE")).resolves.toBeNull();
		});
	});

	describe("deleteByEntity", () => {
		it("removes an existing WorkflowInstance", async () => {
			const repo = new FakeWorkflowRepository();
			await repo.insert(makeInstance("id1", "wf-1"));

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
			await repo.insert(makeInstance("id1", "wf-1"));

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
const _insertArity: AssertEqual<
	Parameters<IWorkflowRepository["insert"]>,
	[WorkflowInstance]
> = true;
// Tuple equality fails to compile if expectedUpdatedAt is made optional (Date | undefined
// isn't the required tuple) — the compile-time guard design.md Decision 1 relies on.
const _updateArity: AssertEqual<
	Parameters<IWorkflowRepository["update"]>,
	[WorkflowInstance, Date]
> = true;
const _deleteByEntityArity: AssertEqual<
	Parameters<IWorkflowRepository["deleteByEntity"]>,
	[string, EntityType]
> = true;

void _findByEntityArity;
void _findByEntityIdsArity;
void _insertArity;
void _updateArity;
void _deleteByEntityArity;
