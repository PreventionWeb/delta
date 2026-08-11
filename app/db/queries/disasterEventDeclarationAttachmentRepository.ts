import { asc, eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterEventDeclarationAttachmentTable,
	disasterEventDeclarationTable,
	InsertDisasterEventDeclarationAttachment,
	SelectDisasterEventDeclarationAttachment,
} from "~/drizzle/schema";

export const DisasterEventDeclarationAttachmentRepository = {
	listByDisasterEventDeclarationId: (
		disasterEventDeclarationId: string,
		tx?: Tx,
	): Promise<SelectDisasterEventDeclarationAttachment[]> => {
		return (tx ?? dr)
			.select()
			.from(disasterEventDeclarationAttachmentTable)
			.where(
				eq(
					disasterEventDeclarationAttachmentTable.disasterEventDeclarationId,
					disasterEventDeclarationId,
				),
			)
			.orderBy(asc(disasterEventDeclarationAttachmentTable.createdAt));
	},
	listByDisasterEventId: async (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select({
				id: disasterEventDeclarationAttachmentTable.id,
				disasterEventDeclarationId:
					disasterEventDeclarationAttachmentTable.disasterEventDeclarationId,
				title: disasterEventDeclarationAttachmentTable.title,
				fileKey: disasterEventDeclarationAttachmentTable.fileKey,
				fileName: disasterEventDeclarationAttachmentTable.fileName,
				fileType: disasterEventDeclarationAttachmentTable.fileType,
				fileSize: disasterEventDeclarationAttachmentTable.fileSize,
				createdAt: disasterEventDeclarationAttachmentTable.createdAt,
				updatedAt: disasterEventDeclarationAttachmentTable.updatedAt,
			})
			.from(disasterEventDeclarationAttachmentTable)
			.innerJoin(
				disasterEventDeclarationTable,
				eq(
					disasterEventDeclarationAttachmentTable.disasterEventDeclarationId,
					disasterEventDeclarationTable.id,
				),
			)
			.where(eq(disasterEventDeclarationTable.disasterEventId, disasterEventId))
			.orderBy(asc(disasterEventDeclarationAttachmentTable.createdAt));
	},
	createMany: async (
		data: InsertDisasterEventDeclarationAttachment[],
		tx?: Tx,
	) => {
		if (data.length === 0) {
			return [] as SelectDisasterEventDeclarationAttachment[];
		}

		return (tx ?? dr)
			.insert(disasterEventDeclarationAttachmentTable)
			.values(data)
			.returning();
	},
	deleteByDisasterEventDeclarationIds: (
		disasterEventDeclarationIds: string[],
		tx?: Tx,
	) => {
		if (disasterEventDeclarationIds.length === 0) {
			return Promise.resolve();
		}

		return (tx ?? dr)
			.delete(disasterEventDeclarationAttachmentTable)
			.where(
				inArray(
					disasterEventDeclarationAttachmentTable.disasterEventDeclarationId,
					disasterEventDeclarationIds,
				),
			);
	},
};
