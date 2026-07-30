import { eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import { damagesGeomTable, InsertDamagesGeom } from "~/drizzle/schema";

export const DamagesGeomRepository = {
	getByDamageId: (damageId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(damagesGeomTable)
			.where(eq(damagesGeomTable.damageId, damageId));
	},
	getByDamageIds: (damageIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(damagesGeomTable)
			.where(inArray(damagesGeomTable.damageId, damageIds));
	},
	createMany: (data: InsertDamagesGeom[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(damagesGeomTable)
			.values(data)
			.returning()
			.execute();
	},
	deleteByDamageId: (damageId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(damagesGeomTable)
			.where(eq(damagesGeomTable.damageId, damageId));
	},
	deleteByDamageIds: (damageIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(damagesGeomTable)
			.where(inArray(damagesGeomTable.damageId, damageIds));
	},
};
