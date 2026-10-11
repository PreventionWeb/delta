export interface EventCausalityReferenceCounts {
	readonly sameTenantCount: number;
	readonly crossTenantCount: number;
}

/**
 * Port for `event_causality`, shared between Hazardous Events and Disaster Events, owned by
 * neither. `tenantId` classifies each matching row's other side into same-tenant/cross-tenant —
 * it does not filter rows out.
 */
export interface IEventCausalityRepository {
	countReferences(
		hazardousEventId: string,
		tenantId: string,
	): Promise<EventCausalityReferenceCounts>;
}
