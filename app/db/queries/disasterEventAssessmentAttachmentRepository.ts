import { and, asc, eq, inArray } from "drizzle-orm";
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
	listByDisasterEventAssessmentIds: (
		disasterEventAssessmentIds: string[],
		tx?: Tx,
	): Promise<SelectDisasterEventAssessmentAttachment[]> => {
		if (disasterEventAssessmentIds.length === 0) {
			return Promise.resolve([] as SelectDisasterEventAssessmentAttachment[]);
		}

		return (tx ?? dr)
			.select()
			.from(disasterEventAssessmentAttachmentTable)
			.where(
				inArray(
					disasterEventAssessmentAttachmentTable.disasterEventAssessmentId,
					disasterEventAssessmentIds,
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
	getById: (id: string, tx?: Tx) => {
		return (tx ?? dr).query.disasterEventAssessmentAttachmentTable.findFirst({
			where: eq(disasterEventAssessmentAttachmentTable.id, id),
		});
	},
	getByIdAndDisasterEventAssessmentId: (
		id: string,
		disasterEventAssessmentId: string,
		tx?: Tx,
	) => {
		return (tx ?? dr).query.disasterEventAssessmentAttachmentTable.findFirst({
			where: and(
				eq(disasterEventAssessmentAttachmentTable.id, id),
				eq(
					disasterEventAssessmentAttachmentTable.disasterEventAssessmentId,
					disasterEventAssessmentId,
				),
			),
		});
	},
	createOne: async (data: InsertDisasterEventAssessmentAttachment, tx?: Tx) => {
		const rows = await (tx ?? dr)
			.insert(disasterEventAssessmentAttachmentTable)
			.values(data)
			.returning();

		return rows[0] ?? null;
	},
	updateById: async (
		id: string,
		data: Partial<InsertDisasterEventAssessmentAttachment>,
		tx?: Tx,
	) => {
		const rows = await (tx ?? dr)
			.update(disasterEventAssessmentAttachmentTable)
			.set(data)
			.where(eq(disasterEventAssessmentAttachmentTable.id, id))
			.returning();

		return rows[0] ?? null;
	},
	deleteById: (id: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventAssessmentAttachmentTable)
			.where(eq(disasterEventAssessmentAttachmentTable.id, id));
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
