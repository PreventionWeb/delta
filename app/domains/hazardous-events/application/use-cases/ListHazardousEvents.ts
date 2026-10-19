import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { HazardousEventListItemDto } from "../dto/HazardousEventListItemDto";
import { toHazardousEventListItemDto } from "../dto/HazardousEventListItemDto";
import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";
import type { ILogger } from "~/shared/logging/ILogger";
import { ValidationError } from "~/shared/errors";
import { assertNonEmptyString } from "../assertNonEmptyString";

export interface ListHazardousEventsQuery {
	tenantId: string;
	page: number;
	pageSize: number;
}

/** Matches parsePagination.ts's own cap (Notices), not an arbitrary number. */
const MAX_PAGE_SIZE = 100;

function assertValidPagination(page: number, pageSize: number): void {
	if (!Number.isInteger(page) || page < 1) {
		throw new ValidationError("page must be an integer >= 1");
	}
	if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
		throw new ValidationError(
			`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`,
		);
	}
}

export class ListHazardousEventsUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly hazardousEventRepository: IHazardousEventRepository,
		private readonly workflowRepository: IWorkflowRepository,
	) {}

	async execute(
		query: ListHazardousEventsQuery,
	): Promise<HazardousEventListItemDto[]> {
		assertNonEmptyString(query.tenantId, "tenantId");
		assertValidPagination(query.page, query.pageSize);

		const events = await this.hazardousEventRepository.findAll(query.tenantId, {
			page: query.page,
			pageSize: query.pageSize,
		});

		let dtos: HazardousEventListItemDto[] = [];
		if (events.length > 0) {
			const ids = events.map((event) => event.id);
			const workflowInstances = await this.workflowRepository.findByEntityIds(
				ids,
				"HE",
			);
			const byEntityId = new Map(
				workflowInstances.map((instance) => [instance.entityId, instance]),
			);
			dtos = events.map((event) =>
				toHazardousEventListItemDto(event, byEntityId.get(event.id) ?? null),
			);
		}

		const missingWorkflowStatusCount = dtos.filter(
			(dto) => dto.workflowStatus === null,
		).length;

		this.logger.info({
			msg: "hazardous_events.listed",
			tenantId: query.tenantId,
			count: dtos.length,
			missingWorkflowStatusCount,
		});

		return dtos;
	}
}
