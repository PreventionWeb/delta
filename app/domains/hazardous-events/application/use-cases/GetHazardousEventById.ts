import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { HazardousEventDetailDto } from "../dto/HazardousEventDetailDto";
import { toHazardousEventDetailDto } from "../dto/HazardousEventDetailDto";
import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";
import type { ILogger } from "~/shared/logging/ILogger";
import { NotFoundError } from "~/shared/errors";
import { assertNonEmptyString } from "../assertNonEmptyString";

export interface GetHazardousEventByIdQuery {
	id: string;
	tenantId: string;
}

export class GetHazardousEventByIdUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly hazardousEventRepository: IHazardousEventRepository,
		private readonly workflowRepository: IWorkflowRepository,
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

		const workflowInstance = await this.workflowRepository.findByEntity(
			event.id,
			"HE",
		);
		// A null here means either a real data-integrity gap or a not-yet-backfilled legacy row; indistinguishable from here.
		if (workflowInstance === null) {
			throw new NotFoundError("WorkflowInstance", event.id);
		}

		const currentObservation =
			await this.hazardousEventRepository.findCurrentSpatialObservation(
				event.id,
				query.tenantId,
			);

		this.logger.info({
			msg: "hazardous_event.fetched",
			hazardousEventId: event.id,
			tenantId: query.tenantId,
			hasCurrentSpatialObservation: currentObservation !== null,
		});

		return toHazardousEventDetailDto(
			event,
			workflowInstance,
			currentObservation,
		);
	}
}
