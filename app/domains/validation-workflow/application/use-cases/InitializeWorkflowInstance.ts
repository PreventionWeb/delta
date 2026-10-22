import {
	WorkflowInstance,
	type EntityType,
} from "../../domain/WorkflowInstance";
import type { IWorkflowRepository } from "../ports/IWorkflowRepository";
import type { Tx } from "~/db.server";

/** No id/now on the command — generated internally (design.md Decision 8). */
export interface InitializeWorkflowInstanceCommand {
	entityId: string;
	entityType: EntityType;
	/** Participates in a caller's own open transaction when present. */
	tx?: Tx;
}

/**
 * Builds and persists a DRAFT WorkflowInstance for a cross-domain caller (design.md Decision
 * 4). No ILogger — runs inside the caller's own open transaction (design.md Decision 7).
 */
export class InitializeWorkflowInstanceUseCase {
	constructor(private readonly workflowRepository: IWorkflowRepository) {}

	// async, unlike its three siblings — createDraft() below can throw synchronously, and this
	// keeps that surfacing as a rejected promise rather than a thrown exception.
	async execute(
		command: InitializeWorkflowInstanceCommand,
	): Promise<WorkflowInstance> {
		const instance = WorkflowInstance.createDraft({
			id: crypto.randomUUID(),
			entityId: command.entityId,
			entityType: command.entityType,
			now: new Date(),
		});
		return this.workflowRepository.insert(instance, command.tx);
	}
}
