import { and, asc, eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	InsertResponseType,
	responseTypeTable,
	SelectResponseType,
} from "~/drizzle/schema";

export const ResponseTypeRepository = {
	getById: (id: string, tx?: Tx) => {
		return (tx ?? dr).query.responseTypeTable.findFirst({
			where: eq(responseTypeTable.id, id),
		});
	},
	createMany: async (data: InsertResponseType[], tx?: Tx) => {
		if (data.length === 0) {
			return [] as SelectResponseType[];
		}
		return (tx ?? dr).insert(responseTypeTable).values(data).returning();
	},
	getByTypes: (types: string[], tx?: Tx) => {
		if (types.length === 0) {
			return Promise.resolve([] as SelectResponseType[]);
		}
		return (tx ?? dr)
			.select()
			.from(responseTypeTable)
			.where(inArray(responseTypeTable.type, types));
	},
	listAll: (tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(responseTypeTable)
			.orderBy(asc(responseTypeTable.type));
	},
	getByType: (type: string, tx?: Tx) => {
		return (tx ?? dr).query.responseTypeTable.findFirst({
			where: eq(responseTypeTable.type, type),
		});
	},
	deleteByType: (type: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(responseTypeTable)
			.where(eq(responseTypeTable.type, type));
	},
	deleteByIdAndType: (id: string, type: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(responseTypeTable)
			.where(
				and(eq(responseTypeTable.id, id), eq(responseTypeTable.type, type)),
			);
	},
};
