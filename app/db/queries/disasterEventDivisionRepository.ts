import { and, eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterEventDivisionTable,
	InsertDisasterEventDivision,
} from "~/drizzle/schema";
import { divisionTable } from "~/drizzle/schema/divisionTable";

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
	getDivisionNamesByDisasterEventIds: async (
		countryAccountsId: string,
		disasterEventIds: string[],
		tx?: Tx,
	) => {
		if (disasterEventIds.length === 0) {
			return [];
		}

		return (tx ?? dr)
			.select({
				disasterEventId: disasterEventDivisionTable.disasterEventId,
				divisionName: divisionTable.name,
			})
			.from(disasterEventDivisionTable)
			.innerJoin(
				divisionTable,
				eq(disasterEventDivisionTable.divisionId, divisionTable.id),
			)
			.where(
				and(
					inArray(disasterEventDivisionTable.disasterEventId, disasterEventIds),
					eq(divisionTable.countryAccountsId, countryAccountsId),
				),
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
