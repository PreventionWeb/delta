import { and, asc, eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	declarationStatusTable,
	InsertDeclarationStatus,
	SelectDeclarationStatus,
} from "~/drizzle/schema";

export const DeclarationStatusRepository = {
	createMany: async (data: InsertDeclarationStatus[], tx?: Tx) => {
		if (data.length === 0) {
			return [] as SelectDeclarationStatus[];
		}
		return (tx ?? dr).insert(declarationStatusTable).values(data).returning();
	},
	listAll: (tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(declarationStatusTable)
			.orderBy(asc(declarationStatusTable.status));
	},
	getByStatus: (status: string, tx?: Tx) => {
		return (tx ?? dr).query.declarationStatusTable.findFirst({
			where: eq(declarationStatusTable.status, status),
		});
	},
	getByStatuses: (statuses: string[], tx?: Tx) => {
		if (statuses.length === 0) {
			return Promise.resolve([] as SelectDeclarationStatus[]);
		}
		return (tx ?? dr)
			.select()
			.from(declarationStatusTable)
			.where(inArray(declarationStatusTable.status, statuses));
	},
	deleteByStatus: (status: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(declarationStatusTable)
			.where(eq(declarationStatusTable.status, status));
	},
	deleteByIdAndStatus: (id: string, status: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(declarationStatusTable)
			.where(
				and(
					eq(declarationStatusTable.id, id),
					eq(declarationStatusTable.status, status),
				),
			);
	},
};
