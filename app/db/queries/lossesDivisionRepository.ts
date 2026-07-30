import { eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import { lossesDivisionTable, InsertLossesDivision } from "~/drizzle/schema";

export const LossesDivisionRepository = {
	getByLossId: (lossId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(lossesDivisionTable)
			.where(eq(lossesDivisionTable.lossId, lossId));
	},
	getByLossIds: (lossIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(lossesDivisionTable)
			.where(inArray(lossesDivisionTable.lossId, lossIds));
	},
	createMany: (data: InsertLossesDivision[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(lossesDivisionTable)
			.values(data)
			.returning()
			.execute();
	},
	deleteByLossId: (lossId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(lossesDivisionTable)
			.where(eq(lossesDivisionTable.lossId, lossId));
	},
	deleteByLossIds: (lossIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(lossesDivisionTable)
			.where(inArray(lossesDivisionTable.lossId, lossIds));
	},
};
