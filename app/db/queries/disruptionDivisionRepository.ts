import { eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disruptionDivisionTable,
	InsertDisruptionDivision,
} from "~/drizzle/schema";

export const DisruptionDivisionRepository = {
	getByDisruptionId: (disruptionId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disruptionDivisionTable)
			.where(eq(disruptionDivisionTable.disruptionId, disruptionId));
	},
	getByDisruptionIds: (disruptionIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disruptionDivisionTable)
			.where(inArray(disruptionDivisionTable.disruptionId, disruptionIds));
	},
	createMany: (data: InsertDisruptionDivision[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(disruptionDivisionTable)
			.values(data)
			.returning()
			.execute();
	},
	deleteByDisruptionId: (disruptionId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disruptionDivisionTable)
			.where(eq(disruptionDivisionTable.disruptionId, disruptionId));
	},
	deleteByDisruptionIds: (disruptionIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(disruptionDivisionTable)
			.where(inArray(disruptionDivisionTable.disruptionId, disruptionIds));
	},
};
