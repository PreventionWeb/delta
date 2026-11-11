import {
	HazardousEvent,
	type HazardousEventCustomFieldValueProps,
	type HazardousEventFieldValueProps,
	type HazardousEventStatus,
} from "../../domain/HazardousEvent";
import type { HazardousEventAttachmentInput } from "../dto/HazardousEventAttachmentInput";
import { resolveAttachmentsForWrite } from "./resolveAttachmentsForWrite";
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
import { toHazardousEventDto } from "../dto/HazardousEventDto";
import type {
	RecordSpatialObservationCommand,
	RecordSpatialObservationUseCase,
} from "./RecordSpatialObservation";
import type { SpatialObservationDto } from "../dto/SpatialObservationDto";
import type { InitializeWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/InitializeWorkflowInstance";
import type { ILogger } from "~/shared/logging/ILogger";
import type { ITransactionRunner } from "~/shared/persistence/ITransactionRunner";
import { ValidationError } from "~/shared/errors";
import { assertNonEmptyString } from "../assertNonEmptyString";

/** Input for CreateHazardousEventUseCase; omits id/createdAt/updatedAt/submittedByUserId/submittedAt/updatedByUserId -- generated or defaulted internally. */
export interface CreateHazardousEventCommand {
	tenantId: string;
	specificHazardId: string;
	startDate: string;
	endDate: string;
	nationalSpecification: string;
	description: string;
	chainsExplanation: string;
	magnitude: string;
	recordOriginator: string;
	dataSource: string;
	hazardousEventStatus: HazardousEventStatus | null;
	specificHazardLocalName: string | null;
	specificHazardNationalName: string | null;
	apiImportId: string | null;
	actingUserId: string;
	hazardDriverIds: readonly string[];
	attachments: readonly HazardousEventAttachmentInput[];
	fieldValues: readonly HazardousEventFieldValueProps[];
	customFieldValues: readonly HazardousEventCustomFieldValueProps[];
	/** If a non-empty string, the new event is persisted as the *effect* of this existing, already-persisted HazardousEvent; `""` also counts as absent. */
	causeId?: string;
	/** Only meaningful when `causeId` is present; ignored otherwise.*/
	causalityExplanation?: string | null;
	/** Mirrors UpdateHazardousEventCommand's own field -- recorded inside the same transaction
	 * as the event/workflow insert when present. */
	spatialObservation?: Omit<
		RecordSpatialObservationCommand,
		"tenantId" | "hazardousEventId" | "tx"
	>;
}

/** `""`/`undefined` both count as absent -- narrowed once so downstream code agrees without a cast; a non-string `causeId` throws rather than silently no-op. */
function resolveCauseId(
	command: CreateHazardousEventCommand,
): string | undefined {
	if (command.causeId === undefined) {
		return undefined;
	}
	if (typeof command.causeId !== "string") {
		throw new ValidationError("causeId must be a string when present");
	}
	return command.causeId === "" ? undefined : command.causeId;
}

/** Crash-safe only, not authoritative -- a malformed element must still fail via HazardousEvent.create()'s ValidationError, not a TypeError here (design.md Decision 8). */
function toSafeStringArray(value: unknown): readonly string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === "string");
}

/** Same crash-safety rationale as `toSafeStringArray`, one level deeper -- a malformed element must still fail via `HazardousEvent.create()`'s ValidationError, not a TypeError here. */
function extractCustomFieldDefinitionIds(
	customFieldValues: CreateHazardousEventCommand["customFieldValues"],
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

/** Use case: construct + persist a HazardousEvent, optionally link a cause event, initialize its WorkflowInstance at DRAFT, and return a HazardousEventDto (order: design.md Decision 4). */
export class CreateHazardousEventUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly taxonomyRepository: IHazardTaxonomyRepository,
		private readonly hazardousEventRepository: IHazardousEventRepository,
		private readonly initializeWorkflowInstanceUseCase: Pick<
			InitializeWorkflowInstanceUseCase,
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
		// Narrowed to the one method actually used (Gate 5/SOLID ISP finding).
		private readonly attachmentStoragePort: Pick<
			IAttachmentStoragePort,
			"promote"
		>,
	) {}

	async execute(
		command: CreateHazardousEventCommand,
	): Promise<HazardousEventDto> {
		// Malformed runtime input (bypassing TypeScript) must fail with ValidationError.
		assertNonEmptyString(command.tenantId, "tenantId");
		assertNonEmptyString(command.actingUserId, "actingUserId");

		const id = crypto.randomUUID();
		const now = new Date();
		const causeId = resolveCauseId(command);
		const hasCause = causeId !== undefined;

		const customFieldDefinitionIds = extractCustomFieldDefinitionIds(
			command.customFieldValues,
		);
		const validHazardDriverIds =
			await this.taxonomyRepository.findValidHazardDriverIds(
				toSafeStringArray(command.hazardDriverIds),
				command.tenantId,
			);
		const validCustomFieldDefinitionIds =
			await this.taxonomyRepository.findValidCustomFieldDefinitionIds(
				customFieldDefinitionIds,
				command.tenantId,
			);

		// Captures the fetched entity's own id, so a cause whose canonical stored form differs cosmetically from the caller's input still links correctly.
		let cause: HazardousEvent | undefined;
		if (causeId !== undefined) {
			// Same-tenant-only, final -- a cross-tenant causeId throws NotFoundError even though it exists in the other tenant.
			cause = await this.hazardousEventRepository.findById(
				causeId,
				command.tenantId,
			);

			// Can never fire against a correct adapter (a fresh id has no edges) -- kept as defense-in-depth so a future update use case reuses the same convention (Decision 1).
			// Uses the raw id/startDate -- the entity itself isn't constructed until inside the transaction below (Decision 7).
			const edges = await this.causalChainRepository.findReachableEdgesFrom(id);
			assertCausalLinkDoesNotCreateCycle(edges, cause.id, id);
			// Mirrors UpdateHazardousEvent.ts:331 -- malformed startDate skips rather than fails closed.
			assertCauseStartsNoLaterThanEffect(cause.startDate, command.startDate);
		}

		const hipCrosswalkIds = await this.hipCrosswalkPort.resolve(
			command.specificHazardId,
		);

		// Whole write sequence is one transaction (DEF-026) -- a failure partway rolls back
		// every earlier write in this call, including the HazardousEvent insert.
		const { saved, savedWorkflow, savedSpatialObservation } =
			await this.transactionRunner.run(async (tx) => {
				// promote() must run inside the transaction (Decision 7) -- a File-type attachment's
				// fileKey/fileSize don't exist until this resolves, which is why create() below moved in too.
				const { attachments } = await resolveAttachmentsForWrite(
					command.attachments,
					[],
					this.attachmentStoragePort,
					{ tenantId: command.tenantId, ownerId: id },
				);

				// updatedAt is null, not `now` — a freshly-created event hasn't been updated yet (Decision 4).
				const newEvent = HazardousEvent.create(
					{
						id,
						tenantId: command.tenantId,
						specificHazardId: command.specificHazardId,
						startDate: command.startDate,
						endDate: command.endDate,
						nationalSpecification: command.nationalSpecification,
						description: command.description,
						chainsExplanation: command.chainsExplanation,
						magnitude: command.magnitude,
						recordOriginator: command.recordOriginator,
						dataSource: command.dataSource,
						hazardousEventStatus: command.hazardousEventStatus,
						specificHazardLocalName: command.specificHazardLocalName,
						specificHazardNationalName: command.specificHazardNationalName,
						apiImportId: command.apiImportId,
						createdByUserId: command.actingUserId,
						updatedByUserId: null,
						submittedByUserId: null,
						submittedAt: null,
						createdAt: now,
						updatedAt: null,
						hazardDriverIds: command.hazardDriverIds,
						attachments,
						fieldValues: command.fieldValues,
						customFieldValues: command.customFieldValues,
					},
					validHazardDriverIds,
					validCustomFieldDefinitionIds,
				);

				const saved = await this.hazardousEventRepository.insert(newEvent, tx);

				// Immediately after the event insert, same tx -- a stamp() failure rolls back the
				// insert too (design.md Decision 17).
				await this.hipCrosswalkPort.stamp(
					saved.id,
					command.tenantId,
					hipCrosswalkIds,
					tx,
				);

				const savedWorkflow =
					await this.initializeWorkflowInstanceUseCase.execute({
						entityId: saved.id,
						entityType: "HE",
						tx,
					});

				// Edge last (design.md Decision 5) -- kept for determinism/compatibility with the
				// pre-5k order; a failure anywhere now rolls back the whole transaction regardless.
				if (cause !== undefined) {
					await this.causalChainRepository.saveEdge(
						{ causeId: cause.id, effectId: saved.id },
						command.causalityExplanation ?? null,
						tx,
					);
				}

				// Mirrors UpdateHazardousEvent.ts's own composition -- same transaction, so a
				// failure here rolls back the HazardousEvent/WorkflowInstance inserts above too.
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

				return { saved, savedWorkflow, savedSpatialObservation };
			});

		// Logged only after the transaction resolves successfully -- a rolled-back transaction
		// rejects the await above and short-circuits past this call entirely.
		this.logger.info({
			msg: "hazardous_event.created",
			hazardousEventId: saved.id,
			tenantId: command.tenantId,
			hasCause,
		});

		// Mirrors UpdateHazardousEvent.ts's own post-commit log for the same event.
		if (savedSpatialObservation !== undefined) {
			this.logger.info({
				msg: "spatial_observation.recorded",
				hazardousEventId: saved.id,
				tenantId: command.tenantId,
				observationTime: savedSpatialObservation.observationTime,
			});
		}

		return toHazardousEventDto(saved, savedWorkflow);
	}
}
