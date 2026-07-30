import { eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import { lossesGeomTable, InsertLossesGeom } from "~/drizzle/schema";

export const LossesGeomRepository = {
	getByLossId: (lossId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(lossesGeomTable)
			.where(eq(lossesGeomTable.lossId, lossId));
	},
	getByLossIds: (lossIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(lossesGeomTable)
			.where(inArray(lossesGeomTable.lossId, lossIds));
	},
	createMany: (data: InsertLossesGeom[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(lossesGeomTable)
			.values(data)
			.returning()
			.execute();
	},
	deleteByLossId: (lossId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(lossesGeomTable)
			.where(eq(lossesGeomTable.lossId, lossId));
	},
	deleteByLossIds: (lossIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(lossesGeomTable)
			.where(inArray(lossesGeomTable.lossId, lossIds));
	},
};
