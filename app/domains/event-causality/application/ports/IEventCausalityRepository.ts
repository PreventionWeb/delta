import type { Tx } from "~/db.server";

export interface EventCausalityReferenceCounts {
	readonly sameTenantCount: number;
	readonly crossTenantCount: number;
}

/**
 * Port for `event_causality`, shared between Hazardous Events and Disaster Events, owned by
 * neither. `tenantId` classifies each matching row's other side into same-tenant/cross-tenant —
 * it does not filter rows out.
 *
 * The only Drizzle/NestJS/Remix import this file may carry is the type-only `Tx` import above —
 * never a `$inferSelect`/`$inferInsert` row type (design.md Decision 3).
 */
export interface IEventCausalityRepository {
	countReferences(
		hazardousEventId: string,
		tenantId: string,
		tx?: Tx,
	): Promise<EventCausalityReferenceCounts>;
}
