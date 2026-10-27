import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { HazardousEventDetailDto } from "../dto/HazardousEventDetailDto";
import { toHazardousEventDetailDto } from "../dto/HazardousEventDetailDto";
import type { GetWorkflowInstanceByEntityUseCase } from "~/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity";
import type { ISpecificHazardTaxonomyRepository } from "../ports/ISpecificHazardTaxonomyRepository";
import type { ILogger } from "~/shared/logging/ILogger";
import { assertNonEmptyString } from "../assertNonEmptyString";

export interface GetHazardousEventByIdQuery {
	id: string;
	tenantId: string;
}

export class GetHazardousEventByIdUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly hazardousEventRepository: IHazardousEventRepository,
		private readonly getWorkflowInstanceByEntityUseCase: Pick<
			GetWorkflowInstanceByEntityUseCase,
			"execute"
		>,
		private readonly specificHazardTaxonomyRepository: Pick<
			ISpecificHazardTaxonomyRepository,
			"findNamesByIds"
		>,
	) {}

	async execute(
		query: GetHazardousEventByIdQuery,
	): Promise<HazardousEventDetailDto> {
		assertNonEmptyString(query.tenantId, "tenantId");
		assertNonEmptyString(query.id, "id");

		const event = await this.hazardousEventRepository.findById(
			query.id,
			query.tenantId,
		);

		const workflowInstance =
			await this.getWorkflowInstanceByEntityUseCase.execute({
				entityId: event.id,
				entityType: "HE",
			});
		// null is ambiguous: a real data-integrity gap vs. a not-yet-backfilled legacy row --
		// indistinguishable from here (DEF-031; degrades gracefully rather than throwing).

		const currentObservation =
			await this.hazardousEventRepository.findCurrentSpatialObservation(
				event.id,
				query.tenantId,
			);

		const taxonomyNames =
			await this.specificHazardTaxonomyRepository.findNamesByIds([
				event.specificHazardId,
			]);

		this.logger.info({
			msg: "hazardous_event.fetched",
			hazardousEventId: event.id,
			tenantId: query.tenantId,
			hasCurrentSpatialObservation: currentObservation !== null,
			...(workflowInstance === null ? { workflowStatusMissing: true } : {}),
		});

		return toHazardousEventDetailDto(
			event,
			workflowInstance,
			currentObservation,
			taxonomyNames.get(event.specificHazardId) ?? null,
		);
	}
}
