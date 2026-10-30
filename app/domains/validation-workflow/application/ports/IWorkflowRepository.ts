import type {
	EntityType,
	WorkflowInstance,
} from "../../domain/WorkflowInstance";
import type { Tx } from "~/db.server";

/**
 * No tenantId anywhere — workflowInstanceTable has no countryAccountsId (schema Decision 2);
 * caller's own repository scopes tenancy.
 *
 * The only Drizzle/NestJS/Remix import this file may carry is the type-only `Tx` import above —
 * never a `$inferSelect`/`$inferInsert` row type (design.md Decision 3).
 */
export interface IWorkflowRepository {
	/** Resolves null, never throws, when no instance exists yet (diverges from INoticeRepository.findById). */
	findByEntity(
		entityId: string,
		entityType: EntityType,
	): Promise<WorkflowInstance | null>;

	/** Batched lookup for list views; omits entities with no instance rather than returning nulls. */
	findByEntityIds(
		entityIds: string[],
		entityType: EntityType,
	): Promise<WorkflowInstance[]>;

	/** First-time persistence only — never updates an existing row*/
	insert(instance: WorkflowInstance, tx?: Tx): Promise<WorkflowInstance>;

	/** Conditional update guarded on `expectedUpdatedAt` — rejects a stale write with
	 * ConcurrentModificationError */
	update(
		instance: WorkflowInstance,
		expectedUpdatedAt: Date,
		tx?: Tx,
	): Promise<WorkflowInstance>;

	/** Idempotent: resolves normally when no matching instance exists. */
	deleteByEntity(
		entityId: string,
		entityType: EntityType,
		tx?: Tx,
	): Promise<void>;
}
