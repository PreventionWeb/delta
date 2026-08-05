import { eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	hazardousEventDivisionTable,
	InsertHazardousEventDivision,
} from "~/drizzle/schema";

export const HazardousEventDivisionRepository = {
	getByHazardousEventId: (hazardousEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(hazardousEventDivisionTable)
			.where(
				eq(hazardousEventDivisionTable.hazardousEventId, hazardousEventId),
			);
	},
	getByHazardousEventIds: (hazardousEventIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(hazardousEventDivisionTable)
			.where(
				inArray(
					hazardousEventDivisionTable.hazardousEventId,
					hazardousEventIds,
				),
			);
	},
	createMany: (data: InsertHazardousEventDivision[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(hazardousEventDivisionTable)
			.values(data)
			.returning()
			.execute();
	},
	deleteByHazardousEventId: (hazardousEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(hazardousEventDivisionTable)
			.where(
				eq(hazardousEventDivisionTable.hazardousEventId, hazardousEventId),
			);
	},
	deleteByHazardousEventIds: (hazardousEventIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(hazardousEventDivisionTable)
			.where(
				inArray(
					hazardousEventDivisionTable.hazardousEventId,
					hazardousEventIds,
				),
			);
	},
};
