import type { EntityType } from "../domain/WorkflowInstance";

/** audit_logs.table_name per workflow entity type; shared so workflow audit entries agree. */
export const ENTITY_TYPE_AUDIT_TABLE_NAME: Partial<Record<EntityType, string>> =
	{
		HE: "hazardous_event",
	};
