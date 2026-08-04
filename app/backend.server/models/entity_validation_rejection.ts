import { dr, Tx } from "~/db.server";
import {
	entityValidationRejectionTable,
	InsertEntityValidationRejection,
} from "~/drizzle/schema/entityValidationRejectionTable";
import { and, eq } from "drizzle-orm";
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
	await tx
		.delete(entityValidationRejectionTable)
		.where(
			and(
				eq(entityValidationRejectionTable.entityId, entityId),
				eq(entityValidationRejectionTable.entityType, entityType),
			),
		)
		.execute();
}
