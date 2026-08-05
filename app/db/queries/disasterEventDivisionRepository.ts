import { eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterEventDivisionTable,
	InsertDisasterEventDivision,
} from "~/drizzle/schema";

export const DisasterEventDivisionRepository = {
	getByDisasterEventId: (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disasterEventDivisionTable)
			.where(eq(disasterEventDivisionTable.disasterEventId, disasterEventId));
	},
	getByDisasterEventIds: (disasterEventIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disasterEventDivisionTable)
			.where(
				inArray(disasterEventDivisionTable.disasterEventId, disasterEventIds),
			);
	},
	createMany: (data: InsertDisasterEventDivision[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(disasterEventDivisionTable)
			.values(data)
			.returning()
			.execute();
	},
	deleteByDisasterEventId: (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventDivisionTable)
			.where(eq(disasterEventDivisionTable.disasterEventId, disasterEventId));
	},
	deleteByDisasterEventIds: (disasterEventIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventDivisionTable)
			.where(
				inArray(disasterEventDivisionTable.disasterEventId, disasterEventIds),
			);
	},
};
