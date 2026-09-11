import type {
	EntityType,
	WorkflowInstance,
} from "../../domain/WorkflowInstance";

/** No tenantId anywhere — workflowInstanceTable has no countryAccountsId (schema Decision 2); caller's own repository scopes tenancy. */
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

	/** Insert-or-update; UNIQUE(entityId, entityType) only guards first-insert races, not lost updates to an existing row. */
	save(instance: WorkflowInstance): Promise<WorkflowInstance>;
}
