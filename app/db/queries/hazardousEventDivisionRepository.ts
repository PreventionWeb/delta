import { and, eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	hazardousEventDivisionTable,
	InsertHazardousEventDivision,
} from "~/drizzle/schema";
import { divisionTable } from "~/drizzle/schema/divisionTable";

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
	getDivisionNamesByHazardousEventIds: async (
		countryAccountsId: string,
		hazardousEventIds: string[],
		tx?: Tx,
	) => {
		if (hazardousEventIds.length === 0) {
			return [];
		}

		return (tx ?? dr)
			.select({
				hazardousEventId: hazardousEventDivisionTable.hazardousEventId,
				divisionName: divisionTable.name,
			})
			.from(hazardousEventDivisionTable)
			.innerJoin(
				divisionTable,
				eq(hazardousEventDivisionTable.divisionId, divisionTable.id),
			)
			.where(
				and(
					inArray(
						hazardousEventDivisionTable.hazardousEventId,
						hazardousEventIds,
					),
					eq(divisionTable.countryAccountsId, countryAccountsId),
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
