import type {
	EntityType,
	WorkflowInstance,
} from "../../domain/WorkflowInstance";
import type { IWorkflowRepository } from "../ports/IWorkflowRepository";
import type { Tx } from "~/db.server";

export interface GetWorkflowInstanceByEntityQuery {
	entityId: string;
	entityType: EntityType;
	/** Reads inside the caller's open transaction (NOD-12). */
	tx?: Tx;
}

/**
 * Proxies a single-entity WorkflowInstance lookup for a cross-domain caller (design.md
 * Decision 4). No ILogger — collaborator-only; callers already log their own composite event
 * (design.md Decision 7).
 */
export class GetWorkflowInstanceByEntityUseCase {
	constructor(private readonly workflowRepository: IWorkflowRepository) {}

	execute(
		query: GetWorkflowInstanceByEntityQuery,
	): Promise<WorkflowInstance | null> {
		return this.workflowRepository.findByEntity(
			query.entityId,
			query.entityType,
			query.tx,
		);
	}
}
