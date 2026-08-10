import { and, asc, eq } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterEventResponseTable,
	InsertDisasterEventResponse,
	responseTypeTable,
	SelectDisasterEventResponse,
} from "~/drizzle/schema";

export type DisasterEventResponseListItem = SelectDisasterEventResponse & {
	responseType: string;
};

export const DisasterEventResponseRepository = {
	listByDisasterEventId: async (
		disasterEventId: string,
		tx?: Tx,
	): Promise<DisasterEventResponseListItem[]> => {
		const rows = await (tx ?? dr)
			.select({
				id: disasterEventResponseTable.id,
				disasterEventId: disasterEventResponseTable.disasterEventId,
				responseTypeId: disasterEventResponseTable.responseTypeId,
				responseDate: disasterEventResponseTable.responseDate,
				coverage: disasterEventResponseTable.coverage,
				description: disasterEventResponseTable.description,
				responseType: responseTypeTable.type,
			})
			.from(disasterEventResponseTable)
			.innerJoin(
				responseTypeTable,
				eq(disasterEventResponseTable.responseTypeId, responseTypeTable.id),
			)
			.where(eq(disasterEventResponseTable.disasterEventId, disasterEventId))
			.orderBy(asc(disasterEventResponseTable.responseDate));

		return rows;
	},
	createMany: async (data: InsertDisasterEventResponse[], tx?: Tx) => {
		if (data.length === 0) {
			return [] as SelectDisasterEventResponse[];
		}

		return (tx ?? dr)
			.insert(disasterEventResponseTable)
			.values(data)
			.returning();
	},
	createOne: async (data: InsertDisasterEventResponse, tx?: Tx) => {
		const rows = await (tx ?? dr)
			.insert(disasterEventResponseTable)
			.values(data)
			.returning();

		return rows[0] ?? null;
	},
	deleteByDisasterEventId: (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventResponseTable)
			.where(eq(disasterEventResponseTable.disasterEventId, disasterEventId));
	},
	deleteByDisasterEventIdAndResponseTypeId: (
		disasterEventId: string,
		responseTypeId: string,
		tx?: Tx,
	) => {
		return (tx ?? dr)
			.delete(disasterEventResponseTable)
			.where(
				and(
					eq(disasterEventResponseTable.disasterEventId, disasterEventId),
					eq(disasterEventResponseTable.responseTypeId, responseTypeId),
				),
			);
	},
};
