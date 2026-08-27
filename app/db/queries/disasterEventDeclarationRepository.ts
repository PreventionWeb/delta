import { and, asc, eq } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	declarationStatusTable,
	disasterEventTable,
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
	withTransaction: <T>(run: (tx: Tx) => Promise<T>) => {
		return dr.transaction(run);
	},
	listByCountryAccountsId: async (
		countryAccountsId: string,
		disasterEventId?: string,
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
			.innerJoin(
				disasterEventTable,
				eq(
					disasterEventDeclarationTable.disasterEventId,
					disasterEventTable.id,
				),
			)
			.leftJoin(
				declarationStatusTable,
				eq(
					disasterEventDeclarationTable.declarationStatusId,
					declarationStatusTable.id,
				),
			)
			.where(
				and(
					eq(disasterEventTable.countryAccountsId, countryAccountsId),
					disasterEventId
						? eq(disasterEventDeclarationTable.disasterEventId, disasterEventId)
						: undefined,
				),
			)
			.orderBy(asc(disasterEventDeclarationTable.declarationDate));

		return rows;
	},
	getByIdAndCountryAccountsId: async (
		id: string,
		countryAccountsId: string,
		tx?: Tx,
	): Promise<DisasterEventDeclarationListItem | null> => {
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
			.innerJoin(
				disasterEventTable,
				eq(
					disasterEventDeclarationTable.disasterEventId,
					disasterEventTable.id,
				),
			)
			.leftJoin(
				declarationStatusTable,
				eq(
					disasterEventDeclarationTable.declarationStatusId,
					declarationStatusTable.id,
				),
			)
			.where(
				and(
					eq(disasterEventDeclarationTable.id, id),
					eq(disasterEventTable.countryAccountsId, countryAccountsId),
				),
			);

		return rows[0] ?? null;
	},
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
	updateById: async (
		id: string,
		data: Partial<InsertDisasterEventDeclaration>,
		tx?: Tx,
	) => {
		const rows = await (tx ?? dr)
			.update(disasterEventDeclarationTable)
			.set(data)
			.where(eq(disasterEventDeclarationTable.id, id))
			.returning();

		return rows[0] ?? null;
	},
	deleteById: (id: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventDeclarationTable)
			.where(eq(disasterEventDeclarationTable.id, id));
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
