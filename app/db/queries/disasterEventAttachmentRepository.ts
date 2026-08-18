import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterEventAttachmentTable,
	InsertDisasterEventAttachment,
	SelectDisasterEventAttachment,
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
	createOne: async (data: InsertDisasterEventAttachment, tx?: Tx) => {
		const rows = await (tx ?? dr)
			.insert(disasterEventAttachmentTable)
			.values(data)
			.returning();

		return rows[0] ?? null;
	},
	getByIdAndDisasterEventId: (
		id: string,
		disasterEventId: string,
		tx?: Tx,
	): Promise<SelectDisasterEventAttachment | null> => {
		return (tx ?? dr).query.disasterEventAttachmentTable
			.findFirst({
				where: and(
					eq(disasterEventAttachmentTable.id, id),
					eq(
						disasterEventAttachmentTable.disasterEventId,
						disasterEventId,
					),
				),
			})
			.then((row) => row ?? null);
	},
	updateById: async (
		id: string,
		data: Partial<InsertDisasterEventAttachment>,
		tx?: Tx,
	) => {
		const rows = await (tx ?? dr)
			.update(disasterEventAttachmentTable)
			.set(data)
			.where(eq(disasterEventAttachmentTable.id, id))
			.returning();

		return rows[0] ?? null;
	},
	deleteById: (id: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventAttachmentTable)
			.where(eq(disasterEventAttachmentTable.id, id));
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
