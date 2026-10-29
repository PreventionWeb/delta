import type {
	IHazardousEventRepository,
	HazardousEventRepositoryFilters,
} from "../ports/IHazardousEventRepository";
import type { HazardousEventListItemDto } from "../dto/HazardousEventListItemDto";
import { toHazardousEventListItemDto } from "../dto/HazardousEventListItemDto";
import type { ListWorkflowInstancesByEntityIdsUseCase } from "~/domains/validation-workflow/application/use-cases/ListWorkflowInstancesByEntityIds";
import type { ISpecificHazardTaxonomyRepository } from "../ports/ISpecificHazardTaxonomyRepository";
import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { ILogger } from "~/shared/logging/ILogger";
import { ValidationError } from "~/shared/errors";
import { assertNonEmptyString } from "../assertNonEmptyString";

/** Use-case-facing filter shape -- presentation imports this, never the repository-facing
 * `HazardousEventRepositoryFilters` (design.md Decision 3's naming/layering note). */
export interface HazardousEventListFilterInput {
	hazardTypeId?: string;
	hazardClusterId?: string;
	specificHazardId?: string;
	fromDate?: string;
	toDate?: string;
	recordingOrganization?: string;
	hazardousEventStatus?: "forecasted" | "ongoing" | "passed";
	recordStatus?: Status;
	viewMyRecords?: boolean;
	pendingMyAction?: boolean;
}

/** A data-viewer's forced visibility restriction (Decision 4) -- exported so the presentation
 * layer's own UI-level option restriction (same Decision) reuses this exact set, not a second
 * hand-copied literal. */
export const DATA_VIEWER_ALLOWED_STATUSES: readonly Status[] = [
	"APPROVED",
	"PUBLISHED",
];

export interface ListHazardousEventsQuery {
	tenantId: string;
	userId: string;
	// Required (not optional), still nullable: an omitted role would silently skip the
	// data-viewer restriction below (design.md Decision 4, second-opinion-review finding).
	role: string | null;
	page: number;
	pageSize: number;
	filters?: HazardousEventListFilterInput;
}

/** Not an ADR-007 envelope (human decision). `unfilteredTotalCount` is Decision 13: summary line's
 * "of Y" is the role-safe unfiltered total, not `totalCount`. */
export interface ListHazardousEventsResult {
	items: HazardousEventListItemDto[];
	totalCount: number;
	unfilteredTotalCount: number;
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
		assertNonEmptyString(query.userId, "userId");
		assertValidPagination(query.page, query.pageSize);

		// Spread, then augment -- never reinterprets a value the caller already supplied
		// (list-hazardous-events spec).
		const roleFilter = {
			...(query.role === "data-viewer"
				? { allowedStatuses: DATA_VIEWER_ALLOWED_STATUSES }
				: {}),
		};
		const filters: HazardousEventRepositoryFilters = {
			...query.filters,
			userId: query.userId,
			...roleFilter,
		};
		// Every user-chosen field omitted -- only the role restriction carries over, or a
		// data-viewer's own narrowing would leak into the "unfiltered" denominator (Decision 13).
		const unfilteredFilters: HazardousEventRepositoryFilters = roleFilter;

		const [events, totalCount, unfilteredTotalCount] = await Promise.all([
			this.hazardousEventRepository.findAll(
				query.tenantId,
				{ page: query.page, pageSize: query.pageSize },
				filters,
			),
			this.hazardousEventRepository.countAll(query.tenantId, filters),
			this.hazardousEventRepository.countAll(query.tenantId, unfilteredFilters),
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

		return { items: dtos, totalCount, unfilteredTotalCount };
	}
}
