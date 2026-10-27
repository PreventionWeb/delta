import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { HazardousEventListItemDto } from "../dto/HazardousEventListItemDto";
import { toHazardousEventListItemDto } from "../dto/HazardousEventListItemDto";
import type { ListWorkflowInstancesByEntityIdsUseCase } from "~/domains/validation-workflow/application/use-cases/ListWorkflowInstancesByEntityIds";
import type { ISpecificHazardTaxonomyRepository } from "../ports/ISpecificHazardTaxonomyRepository";
import type { ILogger } from "~/shared/logging/ILogger";
import { ValidationError } from "~/shared/errors";
import { assertNonEmptyString } from "../assertNonEmptyString";

export interface ListHazardousEventsQuery {
	tenantId: string;
	page: number;
	pageSize: number;
}

/** Not an ADR-007 envelope -- `totalCount` is real list data (feeds the summary line and
 * numbered pagination), not a generic success/error wrapper (human decision, 2026-10-27). */
export interface ListHazardousEventsResult {
	items: HazardousEventListItemDto[];
	totalCount: number;
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
		private readonly listWorkflowInstancesByEntityIdsUseCase: Pick<
			ListWorkflowInstancesByEntityIdsUseCase,
			"execute"
		>,
		private readonly specificHazardTaxonomyRepository: Pick<
			ISpecificHazardTaxonomyRepository,
			"findNamesByIds"
		>,
	) {}

	async execute(
		query: ListHazardousEventsQuery,
	): Promise<ListHazardousEventsResult> {
		assertNonEmptyString(query.tenantId, "tenantId");
		assertValidPagination(query.page, query.pageSize);

		const [events, totalCount] = await Promise.all([
			this.hazardousEventRepository.findAll(query.tenantId, {
				page: query.page,
				pageSize: query.pageSize,
			}),
			this.hazardousEventRepository.countAll(query.tenantId),
		]);

		let dtos: HazardousEventListItemDto[] = [];
		if (events.length > 0) {
			const ids = events.map((event) => event.id);
			const workflowInstances =
				await this.listWorkflowInstancesByEntityIdsUseCase.execute({
					entityIds: ids,
					entityType: "HE",
				});
			const byEntityId = new Map(
				workflowInstances.map((instance) => [instance.entityId, instance]),
			);
			const taxonomyNames =
				await this.specificHazardTaxonomyRepository.findNamesByIds(
					events.map((event) => event.specificHazardId),
				);
			dtos = events.map((event) =>
				toHazardousEventListItemDto(
					event,
					byEntityId.get(event.id) ?? null,
					taxonomyNames.get(event.specificHazardId) ?? null,
				),
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

		return { items: dtos, totalCount };
	}
}
