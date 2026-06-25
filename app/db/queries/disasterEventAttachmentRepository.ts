import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
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

	getByDisasterEventId: (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select({
				id: disasterEventAttachmentTable.id,
				fileKey: disasterEventAttachmentTable.fileKey,
				fileName: disasterEventAttachmentTable.fileName,
				fileType: disasterEventAttachmentTable.fileType,
				fileSize: disasterEventAttachmentTable.fileSize,
				createdAt: disasterEventAttachmentTable.createdAt,
			})
			.from(disasterEventAttachmentTable)
			.where(eq(disasterEventAttachmentTable.disasterEventId, disasterEventId))
			.orderBy(desc(disasterEventAttachmentTable.createdAt));
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

	deleteByDisasterEventIdExceptAttachmentIds: (
		disasterEventId: string,
		keepAttachmentIds: string[],
		tx?: Tx,
	) => {
		if (keepAttachmentIds.length === 0) {
			return DisasterEventAttachmentRepository.deleteByDisasterEventId(
				disasterEventId,
				tx,
			);
		}

		return (tx ?? dr)
			.delete(disasterEventAttachmentTable)
			.where(
				and(
					eq(disasterEventAttachmentTable.disasterEventId, disasterEventId),
					notInArray(disasterEventAttachmentTable.id, keepAttachmentIds),
				),
			);
	},
};
