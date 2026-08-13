import { asc, eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterEventAssessmentAttachmentTable,
	disasterEventAssessmentTable,
	InsertDisasterEventAssessmentAttachment,
	SelectDisasterEventAssessmentAttachment,
} from "~/drizzle/schema";

export const DisasterEventAssessmentAttachmentRepository = {
	listByDisasterEventAssessmentId: (
		disasterEventAssessmentId: string,
		tx?: Tx,
	): Promise<SelectDisasterEventAssessmentAttachment[]> => {
		return (tx ?? dr)
			.select()
			.from(disasterEventAssessmentAttachmentTable)
			.where(
				eq(
					disasterEventAssessmentAttachmentTable.disasterEventAssessmentId,
					disasterEventAssessmentId,
				),
			)
			.orderBy(asc(disasterEventAssessmentAttachmentTable.createdAt));
	},
	listByDisasterEventId: async (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select({
				id: disasterEventAssessmentAttachmentTable.id,
				disasterEventAssessmentId:
					disasterEventAssessmentAttachmentTable.disasterEventAssessmentId,
				title: disasterEventAssessmentAttachmentTable.title,
				fileKey: disasterEventAssessmentAttachmentTable.fileKey,
				fileName: disasterEventAssessmentAttachmentTable.fileName,
				fileType: disasterEventAssessmentAttachmentTable.fileType,
				fileSize: disasterEventAssessmentAttachmentTable.fileSize,
				createdAt: disasterEventAssessmentAttachmentTable.createdAt,
				updatedAt: disasterEventAssessmentAttachmentTable.updatedAt,
			})
			.from(disasterEventAssessmentAttachmentTable)
			.innerJoin(
				disasterEventAssessmentTable,
				eq(
					disasterEventAssessmentAttachmentTable.disasterEventAssessmentId,
					disasterEventAssessmentTable.id,
				),
			)
			.where(eq(disasterEventAssessmentTable.disasterEventId, disasterEventId))
			.orderBy(asc(disasterEventAssessmentAttachmentTable.createdAt));
	},
	createMany: async (
		data: InsertDisasterEventAssessmentAttachment[],
		tx?: Tx,
	) => {
		if (data.length === 0) {
			return [] as SelectDisasterEventAssessmentAttachment[];
		}

		return (tx ?? dr)
			.insert(disasterEventAssessmentAttachmentTable)
			.values(data)
			.returning();
	},
	deleteByDisasterEventAssessmentIds: (
		disasterEventAssessmentIds: string[],
		tx?: Tx,
	) => {
		if (disasterEventAssessmentIds.length === 0) {
			return Promise.resolve();
		}

		return (tx ?? dr)
			.delete(disasterEventAssessmentAttachmentTable)
			.where(
				inArray(
					disasterEventAssessmentAttachmentTable.disasterEventAssessmentId,
					disasterEventAssessmentIds,
				),
			);
	},
};
