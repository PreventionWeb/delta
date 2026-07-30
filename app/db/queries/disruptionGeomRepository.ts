import { eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import { disruptionGeomTable, InsertDisruptionGeom } from "~/drizzle/schema";

export const DisruptionGeomRepository = {
	getByDisruptionId: (disruptionId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disruptionGeomTable)
			.where(eq(disruptionGeomTable.disruptionId, disruptionId));
	},
	getByDisruptionIds: (disruptionIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disruptionGeomTable)
			.where(inArray(disruptionGeomTable.disruptionId, disruptionIds));
	},
	createMany: (data: InsertDisruptionGeom[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(disruptionGeomTable)
			.values(data)
			.returning()
			.execute();
	},
	deleteByDisruptionId: (disruptionId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disruptionGeomTable)
			.where(eq(disruptionGeomTable.disruptionId, disruptionId));
	},
	deleteByDisruptionIds: (disruptionIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(disruptionGeomTable)
			.where(inArray(disruptionGeomTable.disruptionId, disruptionIds));
	},
};
