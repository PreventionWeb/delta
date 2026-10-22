import type {
	EntityType,
	WorkflowInstance,
} from "../../domain/WorkflowInstance";
import type { IWorkflowRepository } from "../ports/IWorkflowRepository";

export interface ListWorkflowInstancesByEntityIdsQuery {
	entityIds: string[];
	entityType: EntityType;
}

/**
 * Proxies a batched WorkflowInstance lookup for a cross-domain caller (design.md Decision 4).
 * No ILogger — same rationale as GetWorkflowInstanceByEntityUseCase (design.md Decision 7).
 */
export class ListWorkflowInstancesByEntityIdsUseCase {
	constructor(private readonly workflowRepository: IWorkflowRepository) {}

	execute(
		query: ListWorkflowInstancesByEntityIdsQuery,
	): Promise<WorkflowInstance[]> {
		return this.workflowRepository.findByEntityIds(
			query.entityIds,
			query.entityType,
		);
	}
}
