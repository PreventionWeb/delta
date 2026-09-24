import { NotFoundError } from "~/shared/errors/DomainError";
import type { EntityType } from "../../domain/WorkflowInstance";

/**
 * Matches NotFoundError's trivial-subclass precedent, extended for a composite (entityId, entityType) key:
 * NotFoundError's constructor takes a single (entity, id) pair, so entityType is folded into the entity name.
 */
export class WorkflowInstanceNotFoundError extends NotFoundError {
	constructor(entityId: string, entityType: EntityType) {
		super(`WorkflowInstance(${entityType})`, entityId);
	}
}
