import { Injectable, Inject } from "@nestjs/common";
import { eq, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Dr } from "~/db.server";
import { eventCausalityTable } from "~/drizzle/schema/eventCausalityTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import type {
	EventCausalityReferenceCounts,
	IEventCausalityRepository,
} from "~/domains/event-causality/application/ports/IEventCausalityRepository";

const triggeringHe = alias(hazardousEventTable, "triggering_he");
const triggeredHe = alias(hazardousEventTable, "triggered_he");
const triggeringDe = alias(disasterEventTable, "triggering_de");
const triggeredDe = alias(disasterEventTable, "triggered_de");

@Injectable()
export class DrizzleEventCausalityRepository implements IEventCausalityRepository {
	constructor(@Inject(DRIZZLE_CLIENT) private readonly db: Dr) {}

	async countReferences(
		hazardousEventId: string,
		tenantId: string,
	): Promise<EventCausalityReferenceCounts> {
		// OR, not UNION: a row matching hazardousEventId on both sides still surfaces once, so it
		// still counts once. Which predicate matched decides which side is "the other side".
		const otherSideTenant = sql`CASE
			WHEN ${eventCausalityTable.triggeringHazardousEventId} = ${hazardousEventId} THEN
				CASE ${eventCausalityTable.triggeredEntityType}
					WHEN 'HE' THEN ${triggeredHe.countryAccountsId}
					ELSE ${triggeredDe.countryAccountsId}
				END
			ELSE
				CASE ${eventCausalityTable.triggeringEntityType}
					WHEN 'HE' THEN ${triggeringHe.countryAccountsId}
					ELSE ${triggeringDe.countryAccountsId}
				END
		END`;

		const [row] = await this.db
			.select({
				// NULL = tenantId is NULL, not true, so a NULL other-side tenant falls out of this
				// FILTER into crossTenantCount; `<>` would also yield NULL and wrongly drop the row.
				sameTenantCount:
					sql<number>`COUNT(*) FILTER (WHERE ${otherSideTenant} = ${tenantId})`.mapWith(
						Number,
					),
				totalCount: sql<number>`COUNT(*)`.mapWith(Number),
			})
			.from(eventCausalityTable)
			.leftJoin(
				triggeringHe,
				eq(triggeringHe.id, eventCausalityTable.triggeringHazardousEventId),
			)
			.leftJoin(
				triggeringDe,
				eq(triggeringDe.id, eventCausalityTable.triggeringDisasterEventId),
			)
			.leftJoin(
				triggeredHe,
				eq(triggeredHe.id, eventCausalityTable.triggeredHazardousEventId),
			)
			.leftJoin(
				triggeredDe,
				eq(triggeredDe.id, eventCausalityTable.triggeredDisasterEventId),
			)
			.where(
				or(
					eq(eventCausalityTable.triggeringHazardousEventId, hazardousEventId),
					eq(eventCausalityTable.triggeredHazardousEventId, hazardousEventId),
				),
			);

		return {
			sameTenantCount: row.sameTenantCount,
			crossTenantCount: row.totalCount - row.sameTenantCount,
		};
	}
}
