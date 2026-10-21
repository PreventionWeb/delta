import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { ICausalChainRepository } from "../ports/ICausalChainRepository";
import type {
	EventCausalityReferenceCounts,
	IEventCausalityRepository,
} from "~/domains/event-causality/application/ports/IEventCausalityRepository";
import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";
import type { ILogger } from "~/shared/logging/ILogger";
import type { ITransactionRunner } from "~/shared/persistence/ITransactionRunner";
import { ConflictError, NotFoundError } from "~/shared/errors";
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
		private readonly transactionRunner: ITransactionRunner,
	) {}

	async execute(command: DeleteHazardousEventCommand): Promise<void> {
		assertNonEmptyString(command.id, "id");
		assertNonEmptyString(command.tenantId, "tenantId");
		assertNonEmptyString(command.actingUserId, "actingUserId");

		// Unlocked, unchanged -- still throws NotFoundError unconditionally for a genuinely
		// missing or foreign-tenant id (design.md Decision 8).
		await this.hazardousEventRepository.findById(command.id, command.tenantId);

		const deleted = await this.transactionRunner.run(async (tx) => {
			try {
				await this.hazardousEventRepository.findByIdForUpdate(
					command.id,
					command.tenantId,
					tx,
				);
			} catch (err) {
				// Can only mean a concurrent transaction deleted this row while this call waited
				// for the lock, since the findById above already confirmed it existed.
				if (err instanceof NotFoundError) {
					return false;
				}
				throw err;
			}

			const [disasterEventCount, eventCausalityCounts, causalChainCount] =
				await Promise.all([
					this.hazardousEventRepository.countReferencingDisasterEvents(
						command.id,
						command.tenantId,
						tx,
					),
					this.eventCausalityRepository.countReferences(
						command.id,
						command.tenantId,
						tx,
					),
					this.causalChainRepository.countEdgesTouching(command.id, tx),
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

			await this.workflowRepository.deleteByEntity(command.id, "HE", tx);
			await this.hazardousEventRepository.delete(
				command.id,
				command.tenantId,
				tx,
			);
			return true;
		});

		if (!deleted) {
			return;
		}

		this.logger.info({
			msg: "hazardous_event.deleted",
			hazardousEventId: command.id,
			tenantId: command.tenantId,
			actingUserId: command.actingUserId,
		});
	}
}
