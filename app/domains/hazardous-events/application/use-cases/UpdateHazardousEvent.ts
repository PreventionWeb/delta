import {
	HazardousEvent,
	type HazardousEventAttachmentProps,
	type HazardousEventCustomFieldValueProps,
	type HazardousEventFieldValueProps,
	type HazardousEventProps,
	type HazardousEventStatus,
} from "../../domain/HazardousEvent";
import type { HazardousEventAttachmentInput } from "../dto/HazardousEventAttachmentInput";
import { resolveAttachmentsForWrite } from "./resolveAttachmentsForWrite";
import { deleteAttachmentFiles } from "./deleteAttachmentFiles";
import type { IAttachmentStoragePort } from "~/domains/shared/attachments/application/ports/IAttachmentStoragePort";
import {
	assertCausalLinkDoesNotCreateCycle,
	assertCauseStartsNoLaterThanEffect,
} from "../../domain/CausalChain";
import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { ICausalChainRepository } from "../ports/ICausalChainRepository";
import type { IHazardTaxonomyRepository } from "../ports/IHazardTaxonomyRepository";
import type { IHipCrosswalkPort } from "../ports/IHipCrosswalkPort";
import type { HazardousEventDto } from "../dto/HazardousEventDto";
import { mapHazardousEventFields } from "../dto/HazardousEventDto";
import type {
	RecordSpatialObservationCommand,
	RecordSpatialObservationUseCase,
} from "./RecordSpatialObservation";
import type { SpatialObservationDto } from "../dto/SpatialObservationDto";
import type { GetWorkflowInstanceByEntityUseCase } from "~/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity";
import type {
	Status,
	WorkflowInstance,
} from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { Tx } from "~/db.server";
import type { ILogger } from "~/shared/logging/ILogger";
import type { ITransactionRunner } from "~/shared/persistence/ITransactionRunner";
import { ValidationError } from "~/shared/errors";
import { assertNonEmptyString } from "../assertNonEmptyString";

// Local override, not HazardousEventDetailDto/HazardousEventListItemDto (wrong semantics for
// Update) -- same Omit-and-override shape as both, repeated rather than generalized (design.md Decision 3).
export type UpdateHazardousEventResult = Omit<
	HazardousEventDto,
	"workflowStatus"
> & { workflowStatus: Status | null };

export interface UpdateHazardousEventCommand {
	id: string;
	tenantId: string;
	actingUserId: string;
	specificHazardId?: string;
	startDate?: string;
	endDate?: string;
	nationalSpecification?: string;
	description?: string;
	chainsExplanation?: string;
	magnitude?: string;
	recordOriginator?: string;
	dataSource?: string;
	hazardousEventStatus?: HazardousEventStatus | null;
	specificHazardLocalName?: string | null;
	specificHazardNationalName?: string | null;
	hazardDriverIds?: readonly string[];
	attachments?: readonly HazardousEventAttachmentInput[];
	fieldValues?: readonly HazardousEventFieldValueProps[];
	customFieldValues?: readonly HazardousEventCustomFieldValueProps[];
	/** undefined leaves the causal link unchanged; null or "" clears it; a string sets it. */
	causeId?: string | null;
	causalityExplanation?: string | null;
	spatialObservation?: Omit<
		RecordSpatialObservationCommand,
		"tenantId" | "hazardousEventId" | "tx"
	>;
}

type CauseAction =
	| { kind: "unchanged" }
	| { kind: "clear" }
	| { kind: "set"; causeId: string };

function resolveCauseAction(command: UpdateHazardousEventCommand): CauseAction {
	const { causeId } = command;
	if (causeId === undefined) {
		return { kind: "unchanged" };
	}
	if (causeId === null || causeId === "") {
		return { kind: "clear" };
	}
	if (typeof causeId !== "string") {
		throw new ValidationError("causeId must be a string or null when present");
	}
	return { kind: "set", causeId };
}

/** Crash-safe only: a malformed element later fails via HazardousEvent.create()'s own ValidationError. */
function toSafeStringArray(value: unknown): readonly string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === "string");
}

function extractCustomFieldDefinitionIds(
	customFieldValues: unknown,
): readonly string[] {
	if (!Array.isArray(customFieldValues)) {
		return [];
	}
	return toSafeStringArray(
		customFieldValues
			.filter(
				(value): value is HazardousEventCustomFieldValueProps =>
					typeof value === "object" && value !== null,
			)
			.map((value) => value.hazardTypeCustomFieldDefinitionId),
	);
}

function buildUpdatedEventProps(
	existingEvent: HazardousEvent,
	command: UpdateHazardousEventCommand,
	mergedHazardDriverIds: readonly string[],
	mergedCustomFieldValues: readonly HazardousEventCustomFieldValueProps[],
	now: Date,
	// Already resolved (promote() called for new File items) -- never command.attachments
	// directly; see resolveAttachmentsForWrite.ts / design.md Decision 7.
	resolvedAttachments: readonly HazardousEventAttachmentProps[],
): HazardousEventProps {
	return {
		id: existingEvent.id,
		tenantId: existingEvent.tenantId,
		specificHazardId:
			command.specificHazardId !== undefined
				? command.specificHazardId
				: existingEvent.specificHazardId,
		startDate:
			command.startDate !== undefined
				? command.startDate
				: existingEvent.startDate,
		endDate: command.endDate ?? existingEvent.endDate,
		nationalSpecification:
			command.nationalSpecification ?? existingEvent.nationalSpecification,
		description: command.description ?? existingEvent.description,
		chainsExplanation:
			command.chainsExplanation ?? existingEvent.chainsExplanation,
		magnitude: command.magnitude ?? existingEvent.magnitude,
		recordOriginator:
			command.recordOriginator ?? existingEvent.recordOriginator,
		dataSource: command.dataSource ?? existingEvent.dataSource,
		hazardousEventStatus:
			command.hazardousEventStatus !== undefined
				? command.hazardousEventStatus
				: existingEvent.hazardousEventStatus,
		specificHazardLocalName:
			command.specificHazardLocalName !== undefined
				? command.specificHazardLocalName
				: existingEvent.specificHazardLocalName,
		specificHazardNationalName:
			command.specificHazardNationalName !== undefined
				? command.specificHazardNationalName
				: existingEvent.specificHazardNationalName,
		apiImportId: existingEvent.apiImportId,
		createdByUserId: existingEvent.createdByUserId,
		updatedByUserId: command.actingUserId,
		submittedByUserId: existingEvent.submittedByUserId,
		submittedAt: existingEvent.submittedAt,
		createdAt: existingEvent.createdAt,
		updatedAt: now,
		hazardDriverIds: mergedHazardDriverIds,
		attachments: resolvedAttachments,
		fieldValues:
			command.fieldValues !== undefined
				? command.fieldValues
				: existingEvent.fieldValues,
		customFieldValues: mergedCustomFieldValues,
	};
}

export class UpdateHazardousEventUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly taxonomyRepository: IHazardTaxonomyRepository,
		private readonly hazardousEventRepository: IHazardousEventRepository,
		private readonly getWorkflowInstanceByEntityUseCase: Pick<
			GetWorkflowInstanceByEntityUseCase,
			"execute"
		>,
		private readonly causalChainRepository: ICausalChainRepository,
		private readonly recordSpatialObservationUseCase: Pick<
			RecordSpatialObservationUseCase,
			"execute"
		>,
		private readonly transactionRunner: ITransactionRunner,
		// TEMPORARY (DEF-055, design.md Decision 17) -- deleted once every dependent domain stops
		// reading hip_hazard_id/hip_cluster_id/hip_type_id off hazardous_event.
		private readonly hipCrosswalkPort: IHipCrosswalkPort,
		// Narrowed to the two methods actually used (Gate 5/SOLID ISP finding).
		private readonly attachmentStoragePort: Pick<
			IAttachmentStoragePort,
			"promote" | "delete"
		>,
	) {}

	async execute(
		command: UpdateHazardousEventCommand,
	): Promise<UpdateHazardousEventResult> {
		assertNonEmptyString(command.tenantId, "tenantId");
		assertNonEmptyString(command.id, "id");
		assertNonEmptyString(command.actingUserId, "actingUserId");

		const existingEvent = await this.hazardousEventRepository.findById(
			command.id,
			command.tenantId,
		);

		// DEF-031: degrades gracefully instead of throwing -- every event created before this
		// refactor has no WorkflowInstance row until Phase M's backfill runs.
		const existingWorkflow: WorkflowInstance | null =
			await this.getWorkflowInstanceByEntityUseCase.execute({
				entityId: existingEvent.id,
				entityType: "HE",
			});

		const causeAction = resolveCauseAction(command);

		const mergedHazardDriverIds =
			command.hazardDriverIds !== undefined
				? command.hazardDriverIds
				: existingEvent.hazardDriverIds;
		const mergedCustomFieldValues =
			command.customFieldValues !== undefined
				? command.customFieldValues
				: existingEvent.customFieldValues;
		const customFieldDefinitionIds = extractCustomFieldDefinitionIds(
			mergedCustomFieldValues,
		);

		// A carried-over id is re-checked here since it may no longer be valid.
		const validHazardDriverIds =
			await this.taxonomyRepository.findValidHazardDriverIds(
				toSafeStringArray(mergedHazardDriverIds),
				command.tenantId,
			);
		const validCustomFieldDefinitionIds =
			await this.taxonomyRepository.findValidCustomFieldDefinitionIds(
				customFieldDefinitionIds,
				command.tenantId,
			);

		// Entity construction itself now happens inside the transaction, after promote()
		// resolves attachments (Decision 7) -- these are the merged values it needs pre-transaction.
		const mergedSpecificHazardId =
			command.specificHazardId !== undefined
				? command.specificHazardId
				: existingEvent.specificHazardId;
		const mergedStartDate =
			command.startDate !== undefined
				? command.startDate
				: existingEvent.startDate;

		// Re-resolved from the merged, final specificHazardId on every update, unconditionally --
		// not only when the command changes it (design.md Decision 17: resting correctness on an
		// unverified assumption about Phase M's own backfill is exactly the kind of guess this
		// project's standing rule against assuming is written to prevent).
		const hipCrosswalkIds = await this.hipCrosswalkPort.resolve(
			mergedSpecificHazardId,
		);

		const cause = await this.validateCauseIfSet(
			causeAction,
			{ id: existingEvent.id, startDate: mergedStartDate },
			command.tenantId,
		);

		// Whole write sequence is one transaction (DEF-026) -- a failure partway rolls back every
		// earlier write in this same call, including the delegated spatial-observation attempt.
		const { saved, savedSpatialObservation } = await this.transactionRunner.run(
			async (tx) => {
				// promote()/delete() run inside the transaction (Decision 7); delete() happens
				// after the row write below, not here -- so a losing concurrent caller (rejected
				// by update()'s optimistic lock) can't delete a file the winner's row still points at.
				const { attachments: resolvedAttachments, fileKeysToDelete } =
					command.attachments !== undefined
						? await resolveAttachmentsForWrite(
								command.attachments,
								existingEvent.attachments,
								this.attachmentStoragePort,
								{ tenantId: command.tenantId, ownerId: existingEvent.id },
							)
						: { attachments: existingEvent.attachments, fileKeysToDelete: [] };

				const updatedEvent = HazardousEvent.create(
					buildUpdatedEventProps(
						existingEvent,
						command,
						mergedHazardDriverIds,
						mergedCustomFieldValues,
						new Date(),
						resolvedAttachments,
					),
					validHazardDriverIds,
					validCustomFieldDefinitionIds,
				);

				const saved = await this.hazardousEventRepository.update(
					updatedEvent,
					existingEvent.updatedAt,
					tx,
				);

				// Immediately after update() succeeds, same tx -- update()'s own optimistic-lock
				// check means a losing concurrent caller rejects before ever reaching this line
				// (design.md Decision 17's concurrency note), and a stamp() failure rolls back the
				// update too.
				await this.hipCrosswalkPort.stamp(
					saved.id,
					command.tenantId,
					hipCrosswalkIds,
					tx,
				);

				await this.applyCausalEdgeChange(
					causeAction,
					cause,
					saved.id,
					command.causalityExplanation ?? null,
					tx,
				);

				let savedSpatialObservation: SpatialObservationDto | undefined;
				if (command.spatialObservation !== undefined) {
					savedSpatialObservation =
						await this.recordSpatialObservationUseCase.execute({
							...command.spatialObservation,
							tenantId: command.tenantId,
							hazardousEventId: saved.id,
							tx,
						});
				}

				// Last in the transaction, after every step that can still throw (Gate 5 finding) --
				// a failure in applyCausalEdgeChange/recordSpatialObservation after an earlier delete()
				// would roll the row back to its old fileKey while the already-deleted file stays gone
				// (Decision 7's dangling-reference case). deleteAttachmentFiles also swallows per-file
				// failures rather than throwing (Decision 7 addendum), so nothing here can trigger that rollback.
				await deleteAttachmentFiles(
					this.attachmentStoragePort,
					this.logger,
					command.tenantId,
					existingEvent.id,
					fileKeysToDelete,
				);

				return { saved, savedSpatialObservation };
			},
		);

		this.logger.info({
			msg: "hazardous_event.updated",
			hazardousEventId: saved.id,
			tenantId: command.tenantId,
			causeAction: causeAction.kind,
			spatialObservationIncluded: command.spatialObservation !== undefined,
			...(existingWorkflow === null ? { workflowStatusMissing: true } : {}),
		});

		// Moved here from RecordSpatialObservationUseCase (design.md Decision 6 addendum) -- logs
		// only after this use case's own outer transaction has committed, not mid-transaction.
		if (savedSpatialObservation !== undefined) {
			this.logger.info({
				msg: "spatial_observation.recorded",
				hazardousEventId: saved.id,
				tenantId: command.tenantId,
				observationTime: savedSpatialObservation.observationTime,
			});
		}

		return {
			...mapHazardousEventFields(saved),
			workflowStatus: existingWorkflow?.status ?? null,
		};
	}

	private async validateCauseIfSet(
		causeAction: CauseAction,
		// Raw id/startDate, not a constructed entity's -- same reason as above (Decision 7).
		updatedEvent: { id: string; startDate: string },
		tenantId: string,
	): Promise<HazardousEvent | undefined> {
		if (causeAction.kind !== "set") {
			return undefined;
		}
		// Same-tenant-only: a cross-tenant causeId throws NotFoundError even if it exists elsewhere.
		const cause = await this.hazardousEventRepository.findById(
			causeAction.causeId,
			tenantId,
		);
		const edges = await this.causalChainRepository.findReachableEdgesFrom(
			updatedEvent.id,
		);
		// Advisory only — replaceCauseEdge's own in-transaction recheck is authoritative.
		assertCausalLinkDoesNotCreateCycle(edges, cause.id, updatedEvent.id);
		assertCauseStartsNoLaterThanEffect(cause.startDate, updatedEvent.startDate);
		return cause;
	}

	private async applyCausalEdgeChange(
		causeAction: CauseAction,
		cause: HazardousEvent | undefined,
		effectId: string,
		causalityExplanation: string | null,
		tx: Tx,
	): Promise<void> {
		if (causeAction.kind === "unchanged") {
			return;
		}
		const newCause =
			causeAction.kind === "set" && cause !== undefined
				? { causeId: cause.id, causalityExplanation }
				: null;
		await this.causalChainRepository.replaceCauseEdge(effectId, newCause, tx);
	}
}
