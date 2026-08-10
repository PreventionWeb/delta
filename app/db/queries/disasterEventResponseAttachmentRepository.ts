import { asc, eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterEventResponseTable,
	disasterEventResponseAttachmentTable,
	InsertDisasterEventResponseAttachment,
	SelectDisasterEventResponseAttachment,
} from "~/drizzle/schema";

export const DisasterEventResponseAttachmentRepository = {
	listByDisasterEventResponseId: (
		disasterEventResponseId: string,
		tx?: Tx,
	): Promise<SelectDisasterEventResponseAttachment[]> => {
		return (tx ?? dr)
			.select()
			.from(disasterEventResponseAttachmentTable)
			.where(
				eq(
					disasterEventResponseAttachmentTable.disasterEventResponseId,
					disasterEventResponseId,
				),
			)
			.orderBy(asc(disasterEventResponseAttachmentTable.createdAt));
	},
	listByDisasterEventId: async (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select({
				id: disasterEventResponseAttachmentTable.id,
				disasterEventResponseId:
					disasterEventResponseAttachmentTable.disasterEventResponseId,
				title: disasterEventResponseAttachmentTable.title,
				fileKey: disasterEventResponseAttachmentTable.fileKey,
				fileName: disasterEventResponseAttachmentTable.fileName,
				fileType: disasterEventResponseAttachmentTable.fileType,
				fileSize: disasterEventResponseAttachmentTable.fileSize,
				createdAt: disasterEventResponseAttachmentTable.createdAt,
				updatedAt: disasterEventResponseAttachmentTable.updatedAt,
			})
			.from(disasterEventResponseAttachmentTable)
			.innerJoin(
				disasterEventResponseTable,
				eq(
					disasterEventResponseAttachmentTable.disasterEventResponseId,
					disasterEventResponseTable.id,
				),
			)
			.where(eq(disasterEventResponseTable.disasterEventId, disasterEventId))
			.orderBy(asc(disasterEventResponseAttachmentTable.createdAt));
	},
	createMany: async (
		data: InsertDisasterEventResponseAttachment[],
		tx?: Tx,
	) => {
		if (data.length === 0) {
			return [] as SelectDisasterEventResponseAttachment[];
		}
		return (tx ?? dr)
			.insert(disasterEventResponseAttachmentTable)
			.values(data)
			.returning();
	},
	deleteByDisasterEventResponseId: (
		disasterEventResponseId: string,
		tx?: Tx,
	) => {
		return (tx ?? dr)
			.delete(disasterEventResponseAttachmentTable)
			.where(
				eq(
					disasterEventResponseAttachmentTable.disasterEventResponseId,
					disasterEventResponseId,
				),
			);
	},
	deleteByDisasterEventResponseIds: (
		disasterEventResponseIds: string[],
		tx?: Tx,
	) => {
		if (disasterEventResponseIds.length === 0) {
			return Promise.resolve();
		}

		return (tx ?? dr)
			.delete(disasterEventResponseAttachmentTable)
			.where(
				inArray(
					disasterEventResponseAttachmentTable.disasterEventResponseId,
					disasterEventResponseIds,
				),
			);
	},
};
