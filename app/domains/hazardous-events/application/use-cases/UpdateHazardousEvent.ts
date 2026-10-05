import {
	HazardousEvent,
	type HazardousEventAttachmentProps,
	type HazardousEventCustomFieldValueProps,
	type HazardousEventFieldValueProps,
	type HazardousEventProps,
	type HazardousEventStatus,
} from "../../domain/HazardousEvent";
import {
	assertCausalLinkDoesNotCreateCycle,
	assertCauseStartsNoLaterThanEffect,
} from "../../domain/CausalChain";
import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { ICausalChainRepository } from "../ports/ICausalChainRepository";
import type { IHazardTaxonomyRepository } from "../ports/IHazardTaxonomyRepository";
import type { HazardousEventDto } from "../dto/HazardousEventDto";
import { toHazardousEventDto } from "../dto/HazardousEventDto";
import type {
	RecordSpatialObservationCommand,
	RecordSpatialObservationUseCase,
} from "./RecordSpatialObservation";
import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";
import type { ILogger } from "~/shared/logging/ILogger";
import { NotFoundError, ValidationError } from "~/shared/errors";
import { assertNonEmptyString } from "../assertNonEmptyString";

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
	attachments?: readonly HazardousEventAttachmentProps[];
	fieldValues?: readonly HazardousEventFieldValueProps[];
	customFieldValues?: readonly HazardousEventCustomFieldValueProps[];
	/** undefined leaves the causal link unchanged; null or "" clears it; a string sets it. */
	causeId?: string | null;
	causalityExplanation?: string | null;
	spatialObservation?: Omit<
		RecordSpatialObservationCommand,
		"tenantId" | "hazardousEventId"
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
		attachments:
			command.attachments !== undefined
				? command.attachments
				: existingEvent.attachments,
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
		private readonly workflowRepository: IWorkflowRepository,
		private readonly causalChainRepository: ICausalChainRepository,
		private readonly recordSpatialObservationUseCase: Pick<
			RecordSpatialObservationUseCase,
			"execute"
		>,
	) {}

	async execute(
		command: UpdateHazardousEventCommand,
	): Promise<HazardousEventDto> {
		assertNonEmptyString(command.tenantId, "tenantId");
		assertNonEmptyString(command.id, "id");
		assertNonEmptyString(command.actingUserId, "actingUserId");

		const existingEvent = await this.hazardousEventRepository.findById(
			command.id,
			command.tenantId,
		);

		// Defensive: a correctly-created event always has a WorkflowInstance.
		const existingWorkflow = await this.workflowRepository.findByEntity(
			existingEvent.id,
			"HE",
		);
		if (existingWorkflow === null) {
			throw new NotFoundError("WorkflowInstance", existingEvent.id);
		}

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

		const updatedEvent = HazardousEvent.create(
			buildUpdatedEventProps(
				existingEvent,
				command,
				mergedHazardDriverIds,
				mergedCustomFieldValues,
				new Date(),
			),
			validHazardDriverIds,
			validCustomFieldDefinitionIds,
		);

		const cause = await this.validateCauseIfSet(
			causeAction,
			updatedEvent,
			command.tenantId,
		);

		const saved = await this.hazardousEventRepository.save(updatedEvent);

		await this.applyCausalEdgeChange(
			causeAction,
			cause,
			saved.id,
			command.causalityExplanation ?? null,
		);

		if (command.spatialObservation !== undefined) {
			await this.recordSpatialObservationUseCase.execute({
				...command.spatialObservation,
				tenantId: command.tenantId,
				hazardousEventId: saved.id,
			});
		}

		this.logger.info({
			msg: "hazardous_event.updated",
			hazardousEventId: saved.id,
			tenantId: command.tenantId,
			causeAction: causeAction.kind,
			spatialObservationIncluded: command.spatialObservation !== undefined,
		});

		return toHazardousEventDto(saved, existingWorkflow);
	}

	private async validateCauseIfSet(
		causeAction: CauseAction,
		updatedEvent: HazardousEvent,
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
		assertCausalLinkDoesNotCreateCycle(edges, cause.id, updatedEvent.id);
		assertCauseStartsNoLaterThanEffect(cause.startDate, updatedEvent.startDate);
		return cause;
	}

	private async applyCausalEdgeChange(
		causeAction: CauseAction,
		cause: HazardousEvent | undefined,
		effectId: string,
		causalityExplanation: string | null,
	): Promise<void> {
		if (causeAction.kind === "clear") {
			await this.causalChainRepository.deleteCauseEdges(effectId);
		} else if (causeAction.kind === "set" && cause !== undefined) {
			await this.causalChainRepository.deleteCauseEdges(effectId);
			await this.causalChainRepository.saveEdge(
				{ causeId: cause.id, effectId },
				causalityExplanation,
			);
		}
	}
}
