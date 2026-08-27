import { and, asc, eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterEventResponseAttachmentTable,
	disasterEventResponseTable,
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
	listByDisasterEventResponseIds: (
		disasterEventResponseIds: string[],
		tx?: Tx,
	): Promise<SelectDisasterEventResponseAttachment[]> => {
		if (disasterEventResponseIds.length === 0) {
			return Promise.resolve([] as SelectDisasterEventResponseAttachment[]);
		}

		return (tx ?? dr)
			.select()
			.from(disasterEventResponseAttachmentTable)
			.where(
				inArray(
					disasterEventResponseAttachmentTable.disasterEventResponseId,
					disasterEventResponseIds,
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
	getById: (id: string, tx?: Tx) => {
		return (tx ?? dr).query.disasterEventResponseAttachmentTable.findFirst({
			where: eq(disasterEventResponseAttachmentTable.id, id),
		});
	},
	getByIdAndDisasterEventResponseId: (
		id: string,
		disasterEventResponseId: string,
		tx?: Tx,
	) => {
		return (tx ?? dr).query.disasterEventResponseAttachmentTable.findFirst({
			where: and(
				eq(disasterEventResponseAttachmentTable.id, id),
				eq(
					disasterEventResponseAttachmentTable.disasterEventResponseId,
					disasterEventResponseId,
				),
			),
		});
	},
	createOne: async (data: InsertDisasterEventResponseAttachment, tx?: Tx) => {
		const rows = await (tx ?? dr)
			.insert(disasterEventResponseAttachmentTable)
			.values(data)
			.returning();

		return rows[0] ?? null;
	},
	updateById: async (
		id: string,
		data: Partial<InsertDisasterEventResponseAttachment>,
		tx?: Tx,
	) => {
		const rows = await (tx ?? dr)
			.update(disasterEventResponseAttachmentTable)
			.set(data)
			.where(eq(disasterEventResponseAttachmentTable.id, id))
			.returning();

		return rows[0] ?? null;
	},
	deleteById: (id: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventResponseAttachmentTable)
			.where(eq(disasterEventResponseAttachmentTable.id, id));
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
