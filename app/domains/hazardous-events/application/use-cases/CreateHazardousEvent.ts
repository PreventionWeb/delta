import {
	HazardousEvent,
	type HazardousEventAttachmentProps,
	type HazardousEventCustomFieldValueProps,
	type HazardousEventFieldValueProps,
	type HazardousEventStatus,
} from "../../domain/HazardousEvent";
import { assertCausalLinkDoesNotCreateCycle } from "../../domain/CausalChain";
import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { ICausalChainRepository } from "../ports/ICausalChainRepository";
import type { IHazardTaxonomyRepository } from "../ports/IHazardTaxonomyRepository";
import type { HazardousEventDto } from "../dto/HazardousEventDto";
import { toHazardousEventDto } from "../dto/HazardousEventDto";
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
	attachments: readonly HazardousEventAttachmentProps[];
	fieldValues: readonly HazardousEventFieldValueProps[];
	customFieldValues: readonly HazardousEventCustomFieldValueProps[];
	/** If a non-empty string, the new event is persisted as the *effect* of this existing, already-persisted HazardousEvent; `""` also counts as absent. */
	causeId?: string;
	/** Only meaningful when `causeId` is present; ignored otherwise.*/
	causalityExplanation?: string | null;
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
		private readonly transactionRunner: ITransactionRunner,
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
				attachments: command.attachments,
				fieldValues: command.fieldValues,
				customFieldValues: command.customFieldValues,
			},
			validHazardDriverIds,
			validCustomFieldDefinitionIds,
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
			const edges = await this.causalChainRepository.findReachableEdgesFrom(
				newEvent.id,
			);
			assertCausalLinkDoesNotCreateCycle(edges, cause.id, newEvent.id);
		}

		// Whole write sequence is one transaction (DEF-026, design.md "The full write sequence
		// runs as one atomic transaction") -- a failure partway rolls back every earlier write in
		// this same call, including the HazardousEvent insert.
		const { saved, savedWorkflow } = await this.transactionRunner.run(
			async (tx) => {
				const saved = await this.hazardousEventRepository.insert(newEvent, tx);

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

				return { saved, savedWorkflow };
			},
		);

		// Logged only after the transaction resolves successfully -- a rolled-back transaction
		// rejects the await above and short-circuits past this call entirely.
		this.logger.info({
			msg: "hazardous_event.created",
			hazardousEventId: saved.id,
			tenantId: command.tenantId,
			hasCause,
		});

		return toHazardousEventDto(saved, savedWorkflow);
	}
}
