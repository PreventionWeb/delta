import { eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import { damagesDivisionTable, InsertDamagesDivision } from "~/drizzle/schema";

export const DamagesDivisionRepository = {
	getByDamageId: (damageId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(damagesDivisionTable)
			.where(eq(damagesDivisionTable.damageId, damageId));
	},
	getByDamageIds: (damageIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(damagesDivisionTable)
			.where(inArray(damagesDivisionTable.damageId, damageIds));
	},
	createMany: (data: InsertDamagesDivision[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(damagesDivisionTable)
			.values(data)
			.returning()
			.execute();
	},
	deleteByDamageId: (damageId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(damagesDivisionTable)
			.where(eq(damagesDivisionTable.damageId, damageId));
	},
	deleteByDamageIds: (damageIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(damagesDivisionTable)
			.where(inArray(damagesDivisionTable.damageId, damageIds));
	},
};
