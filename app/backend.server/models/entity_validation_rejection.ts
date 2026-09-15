import { dr, Tx } from "~/db.server";
import {
	entityValidationRejectionTable,
	InsertEntityValidationRejection,
} from "~/drizzle/schema/entityValidationRejectionTable";
import { and, eq, inArray, sql } from "drizzle-orm";
import { entityType } from "./entity_validation_assignment";

export async function entityValidationRejectionInsert(
	props: InsertEntityValidationRejection,
): Promise<void> {
	await dr.insert(entityValidationRejectionTable).values({
		entityId: props.entityId,
		entityType: props.entityType,
		rejectedByUserId: props.rejectedByUserId,
		rejectionMessage: props.rejectionMessage,
	});
}

export async function entityValidationRejectionDeleteByEntityId(
	entityId: string,
	entityType: entityType,
	tx: Tx = dr,
): Promise<void> {
	const entityTypes =
		entityType === "disaster_records"
			? ["disaster_records", "disaster_record"]
			: [entityType];

	const entityTypeAsText = sql`${entityValidationRejectionTable.entityType}::text`;

	await tx
		.delete(entityValidationRejectionTable)
		.where(
			and(
				eq(entityValidationRejectionTable.entityId, entityId),
				inArray(entityTypeAsText, entityTypes),
			),
		)
		.execute();
}
