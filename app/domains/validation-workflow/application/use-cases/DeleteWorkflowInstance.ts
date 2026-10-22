import type { EntityType } from "../../domain/WorkflowInstance";
import type { IWorkflowRepository } from "../ports/IWorkflowRepository";
import type { Tx } from "~/db.server";

export interface DeleteWorkflowInstanceCommand {
	entityId: string;
	entityType: EntityType;
	/** Participates in a caller's own open transaction when present. */
	tx?: Tx;
}

/**
 * Removes the WorkflowInstance for a deleted entity, for a cross-domain caller (design.md
 * Decision 4). No ILogger — same rationale as InitializeWorkflowInstanceUseCase (Decision 7).
 */
export class DeleteWorkflowInstanceUseCase {
	constructor(private readonly workflowRepository: IWorkflowRepository) {}

	execute(command: DeleteWorkflowInstanceCommand): Promise<void> {
		return this.workflowRepository.deleteByEntity(
			command.entityId,
			command.entityType,
			command.tx,
		);
	}
}
