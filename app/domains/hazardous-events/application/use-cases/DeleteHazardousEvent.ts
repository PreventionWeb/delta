import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { ICausalChainRepository } from "../ports/ICausalChainRepository";
import type {
	EventCausalityReferenceCounts,
	IEventCausalityRepository,
} from "~/domains/event-causality/application/ports/IEventCausalityRepository";
import type { DeleteWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/DeleteWorkflowInstance";
import type { ILogger } from "~/shared/logging/ILogger";
import type { ITransactionRunner } from "~/shared/persistence/ITransactionRunner";
import type { IAttachmentStoragePort } from "~/domains/shared/attachments/application/ports/IAttachmentStoragePort";
import { deleteAttachmentFiles } from "./deleteAttachmentFiles";
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
		private readonly deleteWorkflowInstanceUseCase: Pick<
			DeleteWorkflowInstanceUseCase,
			"execute"
		>,
		private readonly transactionRunner: ITransactionRunner,
		// Narrowed to the one method actually used (Gate 5/SOLID ISP finding).
		private readonly attachmentStoragePort: Pick<
			IAttachmentStoragePort,
			"delete"
		>,
	) {}

	async execute(command: DeleteHazardousEventCommand): Promise<void> {
		assertNonEmptyString(command.id, "id");
		assertNonEmptyString(command.tenantId, "tenantId");
		assertNonEmptyString(command.actingUserId, "actingUserId");

		// Unlocked, unchanged -- still throws NotFoundError unconditionally for a genuinely
		// missing or foreign-tenant id (design.md Decision 8).
		await this.hazardousEventRepository.findById(command.id, command.tenantId);

		const deleted = await this.transactionRunner.run(async (tx) => {
			let locked;
			try {
				locked = await this.hazardousEventRepository.findByIdForUpdate(
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

			await this.deleteWorkflowInstanceUseCase.execute({
				entityId: command.id,
				entityType: "HE",
				tx,
			});
			await this.hazardousEventRepository.delete(
				command.id,
				command.tenantId,
				tx,
			);

			// After the row delete succeeds, not before -- a blocked delete (dependents.length > 0
			// above) must leave attachments untouched; deleting first then throwing would orphan a file whose DB row remains.
			const fileKeysToDelete = locked.attachments
				.filter((attachment) => attachment.type === "File")
				.map((attachment) => attachment.fileKey)
				.filter((fileKey): fileKey is string => fileKey !== null);
			await deleteAttachmentFiles(
				this.attachmentStoragePort,
				this.logger,
				command.tenantId,
				command.id,
				fileKeysToDelete,
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
