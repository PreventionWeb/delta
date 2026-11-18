import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { ICausalChainRepository } from "../ports/ICausalChainRepository";
import type { HazardousEventDetailDto } from "../dto/HazardousEventDetailDto";
import { toHazardousEventDetailDto } from "../dto/HazardousEventDetailDto";
import { HAZARDOUS_EVENT_AUDIT_TABLE_NAME } from "../dto/HazardousEventDto";
import type { GetWorkflowInstanceByEntityUseCase } from "~/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity";
import type {
	ISpecificHazardTaxonomyRepository,
	SpecificHazardTaxonomyNames,
} from "../ports/ISpecificHazardTaxonomyRepository";
import type { IAuditLogPort } from "~/domains/shared/audit-log/application/ports/IAuditLogPort";
import type { ILogger } from "~/shared/logging/ILogger";
import { assertNonEmptyString } from "../assertNonEmptyString";
import { humanizeAuditAction } from "../humanizeAuditAction";
import { NotFoundError } from "~/shared/errors";

export interface GetHazardousEventByIdQuery {
	id: string;
	tenantId: string;
}

/** Same specificHazardName -> hazardClusterName -> hazardTypeName fallback as the event; "" when no match. */
function causeDisplayName(names: SpecificHazardTaxonomyNames | null): string {
	return (
		names?.specificHazardName ||
		names?.hazardClusterName ||
		names?.hazardTypeName ||
		""
	);
}

/** Shared shape for a resolved cause or effect (design.md Decision 14, Finding 6). */
function toLinkedEventSummary(
	event: Awaited<ReturnType<IHazardousEventRepository["findById"]>>,
	taxonomyNames: ReadonlyMap<string, SpecificHazardTaxonomyNames>,
	causalityExplanation: string | null,
): NonNullable<HazardousEventDetailDto["cause"]> {
	const names = taxonomyNames.get(event.specificHazardId) ?? null;
	return {
		id: event.id,
		displayName: causeDisplayName(names),
		causalityExplanation,
		specificHazardCode: names?.specificHazardCode ?? null,
		description: event.description,
	};
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
		// Defaulted so pre-existing call sites keep compiling unchanged.
		private readonly causalChainRepository: Pick<
			ICausalChainRepository,
			"findCauseEdge" | "findEffectEdges"
		> = { findCauseEdge: async () => null, findEffectEdges: async () => [] },
		// Same defaulting rationale as causalChainRepository above.
		private readonly auditLogPort: Pick<IAuditLogPort, "findByRecord"> = {
			findByRecord: async () => [],
		},
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
		// edge degrades to "no cause" here, not a failure (see DEF-012).
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
				// Only NotFoundError degrades; a real failure must not masquerade as "no cause".
				if (!(err instanceof NotFoundError)) {
					throw err;
				}
				causeEvent = null;
			}
		}

		const effectEdges = await this.causalChainRepository.findEffectEdges(
			event.id,
		);
		// Same degrade-gracefully-per-edge pattern as causeEvent: one dangling effect edge must not fail the rest.
		const resolvedEffects: {
			event: Awaited<ReturnType<IHazardousEventRepository["findById"]>>;
			causalityExplanation: string | null;
		}[] = [];
		for (const edge of effectEdges) {
			try {
				const effectEvent = await this.hazardousEventRepository.findById(
					edge.effectId,
					query.tenantId,
				);
				resolvedEffects.push({
					event: effectEvent,
					causalityExplanation: edge.causalityExplanation,
				});
			} catch (err) {
				if (!(err instanceof NotFoundError)) {
					throw err;
				}
			}
		}

		const taxonomyNames =
			await this.specificHazardTaxonomyRepository.findNamesByIds([
				event.specificHazardId,
				...(causeEvent === null ? [] : [causeEvent.specificHazardId]),
				...resolvedEffects.map(({ event: effect }) => effect.specificHazardId),
			]);

		const auditLogRows = await this.auditLogPort.findByRecord(
			HAZARDOUS_EVENT_AUDIT_TABLE_NAME,
			event.id,
			query.tenantId,
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
				: toLinkedEventSummary(
						causeEvent,
						taxonomyNames,
						causeEdge?.causalityExplanation ?? null,
					);

		const effects = resolvedEffects.map(
			({ event: effectEvent, causalityExplanation }) =>
				toLinkedEventSummary(effectEvent, taxonomyNames, causalityExplanation),
		);

		const auditLog = auditLogRows.map((row) => ({
			id: row.id,
			action: humanizeAuditAction(row.action),
			actorName: row.actorName,
			timestamp: row.timestamp.toISOString(),
		}));

		return toHazardousEventDetailDto(
			event,
			workflowInstance,
			currentObservation,
			taxonomyNames.get(event.specificHazardId) ?? null,
			cause,
			effects,
			auditLog,
		);
	}
}
