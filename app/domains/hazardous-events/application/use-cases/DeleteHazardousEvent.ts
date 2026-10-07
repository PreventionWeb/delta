import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { ICausalChainRepository } from "../ports/ICausalChainRepository";
import type {
	EventCausalityReferenceCounts,
	IEventCausalityRepository,
} from "~/domains/shared/application/ports/IEventCausalityRepository";
import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";
import type { ILogger } from "~/shared/logging/ILogger";
import { ConflictError } from "~/shared/errors";
import { assertNonEmptyString } from "../assertNonEmptyString";

export interface DeleteHazardousEventCommand {
	id: string;
	tenantId: string;
	actingUserId: string;
}

export type DeleteHazardousEventDependent =
	| { type: "DISASTER_EVENT"; count: number }
	| {
			type: "EVENT_CAUSALITY";
			/** Same-tenant count only — crossTenantReferenceExists is the only signal for the rest. */
			count: number;
			crossTenantReferenceExists: boolean;
	  }
	| { type: "CAUSAL_CHAIN"; count: number };

function buildDependents(
	disasterEventCount: number,
	eventCausalityCounts: EventCausalityReferenceCounts,
	causalChainCount: number,
): DeleteHazardousEventDependent[] {
	const dependents: DeleteHazardousEventDependent[] = [];
	if (disasterEventCount > 0) {
		dependents.push({ type: "DISASTER_EVENT", count: disasterEventCount });
	}
	const eventCausalityTotal =
		eventCausalityCounts.sameTenantCount +
		eventCausalityCounts.crossTenantCount;
	if (eventCausalityTotal > 0) {
		dependents.push({
			type: "EVENT_CAUSALITY",
			count: eventCausalityCounts.sameTenantCount,
			crossTenantReferenceExists: eventCausalityCounts.crossTenantCount > 0,
		});
	}
	if (causalChainCount > 0) {
		dependents.push({ type: "CAUSAL_CHAIN", count: causalChainCount });
	}
	return dependents;
}

export class DeleteHazardousEventUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly hazardousEventRepository: IHazardousEventRepository,
		private readonly eventCausalityRepository: IEventCausalityRepository,
		private readonly causalChainRepository: ICausalChainRepository,
		private readonly workflowRepository: IWorkflowRepository,
	) {}

	async execute(command: DeleteHazardousEventCommand): Promise<void> {
		assertNonEmptyString(command.id, "id");
		assertNonEmptyString(command.tenantId, "tenantId");
		assertNonEmptyString(command.actingUserId, "actingUserId");

		await this.hazardousEventRepository.findById(command.id, command.tenantId);

		const [disasterEventCount, eventCausalityCounts, causalChainCount] =
			await Promise.all([
				this.hazardousEventRepository.countReferencingDisasterEvents(
					command.id,
					command.tenantId,
				),
				this.eventCausalityRepository.countReferences(
					command.id,
					command.tenantId,
				),
				this.causalChainRepository.countEdgesTouching(command.id),
			]);

		const dependents = buildDependents(
			disasterEventCount,
			eventCausalityCounts,
			causalChainCount,
		);

		if (dependents.length > 0) {
			throw new ConflictError(
				"Cannot delete a hazardous event that has dependents",
				{
					hazardousEventId: command.id,
					dependents,
				},
			);
		}

		await this.workflowRepository.deleteByEntity(command.id, "HE");
		await this.hazardousEventRepository.delete(command.id, command.tenantId);

		this.logger.info({
			msg: "hazardous_event.deleted",
			hazardousEventId: command.id,
			tenantId: command.tenantId,
			actingUserId: command.actingUserId,
		});
	}
}
