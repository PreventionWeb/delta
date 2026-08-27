import { dr, Tx } from "~/db.server";
import { hipHazardTable } from "~/drizzle/schema";
import { eq } from "drizzle-orm";

export const HipHazardRepository = {
	getAll: (tx?: Tx) => {
		return (tx ?? dr).select().from(hipHazardTable);
	},
	getByHipClusterId: (hipClusterId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(hipHazardTable)
			.where(eq(hipHazardTable.clusterId, hipClusterId));
	},
};
