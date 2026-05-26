import { dr, Tx } from "~/db.server";
import { hipClusterTable } from "~/drizzle/schema";
import { eq } from "drizzle-orm";

export const HipClusterRepository = {
	getAll: (tx?: Tx) => {
		return (tx ?? dr).select().from(hipClusterTable);
	},
	getByHipClassId: (hipClassId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(hipClusterTable)
			.where(eq(hipClusterTable.typeId, hipClassId));
	},
};
