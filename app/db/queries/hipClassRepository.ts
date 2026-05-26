import { dr, Tx } from "~/db.server";
import { hipTypeTable } from "~/drizzle/schema";

export const HipClassRepository = {
	getAll: (tx?: Tx) => {
		return (tx ?? dr).select().from(hipTypeTable);
	},
};
