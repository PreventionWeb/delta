import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { ICausalChainRepository } from "../ports/ICausalChainRepository";
import type { HazardousEventDetailDto } from "../dto/HazardousEventDetailDto";
import { toHazardousEventDetailDto } from "../dto/HazardousEventDetailDto";
import type { GetWorkflowInstanceByEntityUseCase } from "~/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity";
import type {
	ISpecificHazardTaxonomyRepository,
	SpecificHazardTaxonomyNames,
} from "../ports/ISpecificHazardTaxonomyRepository";
import type { ILogger } from "~/shared/logging/ILogger";
import { assertNonEmptyString } from "../assertNonEmptyString";
import { NotFoundError } from "~/shared/errors";

export interface GetHazardousEventByIdQuery {
	id: string;
	tenantId: string;
}

/** Same specificHazardName -> hazardClusterName -> hazardTypeName fallback this use case's own
 * event already uses; "" when no match at all. */
function causeDisplayName(names: SpecificHazardTaxonomyNames | null): string {
	return (
		names?.specificHazardName ||
		names?.hazardClusterName ||
		names?.hazardTypeName ||
		""
	);
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
		// Defaulted (not required) so every pre-existing call site that doesn't care about the
		// causal-chain parent keeps compiling unchanged; real wiring always passes the real adapter.
		private readonly causalChainRepository: Pick<
			ICausalChainRepository,
			"findCauseEdge"
		> = { findCauseEdge: async () => null },
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

		const causeEdge = await this.causalChainRepository.findCauseEdge(event.id);
		// Edge lookup here is unscoped; the cause fetch below is tenant-scoped, so a cross-tenant
		// edge (none today, confirmed 2026-11-04 -- see DEF-012) degrades to "no cause" here, not a
		// failure (DEF-031 precedent, as above).
		let causeEvent: Awaited<
			ReturnType<IHazardousEventRepository["findById"]>
		> | null = null;
		if (causeEdge !== null) {
			try {
				causeEvent = await this.hazardousEventRepository.findById(
					causeEdge.causeId,
					query.tenantId,
				);
			} catch (err) {
				// Only NotFoundError degrades (code review finding -- a real failure must not
				// masquerade as "no cause").
				if (!(err instanceof NotFoundError)) {
					throw err;
				}
				causeEvent = null;
			}
		}

		const taxonomyNames =
			await this.specificHazardTaxonomyRepository.findNamesByIds(
				causeEvent === null
					? [event.specificHazardId]
					: [event.specificHazardId, causeEvent.specificHazardId],
			);

		this.logger.info({
			msg: "hazardous_event.fetched",
			hazardousEventId: event.id,
			tenantId: query.tenantId,
			hasCurrentSpatialObservation: currentObservation !== null,
			...(workflowInstance === null ? { workflowStatusMissing: true } : {}),
		});

		const cause =
			causeEvent === null
				? null
				: {
						id: causeEvent.id,
						displayName: causeDisplayName(
							taxonomyNames.get(causeEvent.specificHazardId) ?? null,
						),
						causalityExplanation: causeEdge?.causalityExplanation ?? null,
					};

		return toHazardousEventDetailDto(
			event,
			workflowInstance,
			currentObservation,
			taxonomyNames.get(event.specificHazardId) ?? null,
			cause,
		);
	}
}
