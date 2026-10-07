export interface EventCausalityReferenceCounts {
	readonly sameTenantCount: number;
	readonly crossTenantCount: number;
}

/**
 * Port for `event_causality` — a Shared Kernel table between Hazardous Events and Disaster
 * Events (no single domain owns it). `tenantId` classifies each matching row's own other side
 * into the same-tenant/cross-tenant split a caller needs to shape disclosure, not to filter.
 */
export interface IEventCausalityRepository {
	countReferences(
		hazardousEventId: string,
		tenantId: string,
	): Promise<EventCausalityReferenceCounts>;
}
