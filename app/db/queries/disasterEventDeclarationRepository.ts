import { and, asc, eq } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	declarationStatusTable,
	disasterEventDeclarationTable,
	InsertDisasterEventDeclaration,
	SelectDisasterEventDeclaration,
} from "~/drizzle/schema";

export type DisasterEventDeclarationListItem =
	SelectDisasterEventDeclaration & {
		declarationStatus: string | null;
		declarationStatusDescription: string | null;
	};

export const DisasterEventDeclarationRepository = {
	listByDisasterEventId: async (
		disasterEventId: string,
		tx?: Tx,
	): Promise<DisasterEventDeclarationListItem[]> => {
		const rows = await (tx ?? dr)
			.select({
				id: disasterEventDeclarationTable.id,
				disasterEventId: disasterEventDeclarationTable.disasterEventId,
				type: disasterEventDeclarationTable.type,
				effects: disasterEventDeclarationTable.effects,
				declarationDate: disasterEventDeclarationTable.declarationDate,
				issuingOrganization: disasterEventDeclarationTable.issuingOrganization,
				coverage: disasterEventDeclarationTable.coverage,
				declarationStatusId: disasterEventDeclarationTable.declarationStatusId,
				declarationStatus: declarationStatusTable.status,
				declarationStatusDescription: declarationStatusTable.description,
			})
			.from(disasterEventDeclarationTable)
			.leftJoin(
				declarationStatusTable,
				eq(
					disasterEventDeclarationTable.declarationStatusId,
					declarationStatusTable.id,
				),
			)
			.where(eq(disasterEventDeclarationTable.disasterEventId, disasterEventId))
			.orderBy(asc(disasterEventDeclarationTable.declarationDate));

		return rows;
	},
	createMany: async (data: InsertDisasterEventDeclaration[], tx?: Tx) => {
		if (data.length === 0) {
			return [] as SelectDisasterEventDeclaration[];
		}

		return (tx ?? dr)
			.insert(disasterEventDeclarationTable)
			.values(data)
			.returning();
	},
	createOne: async (data: InsertDisasterEventDeclaration, tx?: Tx) => {
		const rows = await (tx ?? dr)
			.insert(disasterEventDeclarationTable)
			.values(data)
			.returning();

		return rows[0] ?? null;
	},
	deleteByDisasterEventId: (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventDeclarationTable)
			.where(
				eq(disasterEventDeclarationTable.disasterEventId, disasterEventId),
			);
	},
	deleteByDisasterEventIdAndType: (
		disasterEventId: string,
		type: string,
		tx?: Tx,
	) => {
		return (tx ?? dr)
			.delete(disasterEventDeclarationTable)
			.where(
				and(
					eq(disasterEventDeclarationTable.disasterEventId, disasterEventId),
					eq(disasterEventDeclarationTable.type, type),
				),
			);
	},
};
