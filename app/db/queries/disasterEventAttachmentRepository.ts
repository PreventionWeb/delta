import { eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterEventAttachmentTable,
	InsertDisasterEventAttachment,
} from "~/drizzle/schema";

export const DisasterEventAttachmentRepository = {
	getByDisasterEventIds: (disasterEventIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disasterEventAttachmentTable)
			.where(
				inArray(disasterEventAttachmentTable.disasterEventId, disasterEventIds),
			);
	},

	createMany: (data: InsertDisasterEventAttachment[], tx?: Tx) => {
		return (tx ?? dr).insert(disasterEventAttachmentTable).values(data);
	},

	deleteByDisasterEventIds: (disasterEventIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventAttachmentTable)
			.where(
				inArray(disasterEventAttachmentTable.disasterEventId, disasterEventIds),
			);
	},

	deleteByDisasterEventId: (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventAttachmentTable)
			.where(eq(disasterEventAttachmentTable.disasterEventId, disasterEventId));
	},
};
