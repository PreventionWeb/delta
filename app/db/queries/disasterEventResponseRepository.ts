import { and, asc, eq } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterEventTable,
	disasterEventResponseTable,
	InsertDisasterEventResponse,
	responseTypeTable,
	SelectDisasterEventResponse,
} from "~/drizzle/schema";

export type DisasterEventResponseListItem = SelectDisasterEventResponse & {
	responseType: string;
};

export const DisasterEventResponseRepository = {
	withTransaction: <T>(run: (tx: Tx) => Promise<T>) => {
		return dr.transaction(run);
	},
	listByCountryAccountsId: async (
		countryAccountsId: string,
		disasterEventId?: string,
		tx?: Tx,
	): Promise<DisasterEventResponseListItem[]> => {
		const rows = await (tx ?? dr)
			.select({
				id: disasterEventResponseTable.id,
				disasterEventId: disasterEventResponseTable.disasterEventId,
				responseTypeId: disasterEventResponseTable.responseTypeId,
				responseDate: disasterEventResponseTable.responseDate,
				coverage: disasterEventResponseTable.coverage,
				description: disasterEventResponseTable.description,
				responseType: responseTypeTable.type,
			})
			.from(disasterEventResponseTable)
			.innerJoin(
				disasterEventTable,
				eq(disasterEventResponseTable.disasterEventId, disasterEventTable.id),
			)
			.innerJoin(
				responseTypeTable,
				eq(disasterEventResponseTable.responseTypeId, responseTypeTable.id),
			)
			.where(
				and(
					eq(disasterEventTable.countryAccountsId, countryAccountsId),
					disasterEventId
						? eq(disasterEventResponseTable.disasterEventId, disasterEventId)
						: undefined,
				),
			)
			.orderBy(asc(disasterEventResponseTable.responseDate));

		return rows;
	},
	getByIdAndCountryAccountsId: async (
		id: string,
		countryAccountsId: string,
		tx?: Tx,
	): Promise<DisasterEventResponseListItem | null> => {
		const rows = await (tx ?? dr)
			.select({
				id: disasterEventResponseTable.id,
				disasterEventId: disasterEventResponseTable.disasterEventId,
				responseTypeId: disasterEventResponseTable.responseTypeId,
				responseDate: disasterEventResponseTable.responseDate,
				coverage: disasterEventResponseTable.coverage,
				description: disasterEventResponseTable.description,
				responseType: responseTypeTable.type,
			})
			.from(disasterEventResponseTable)
			.innerJoin(
				disasterEventTable,
				eq(disasterEventResponseTable.disasterEventId, disasterEventTable.id),
			)
			.innerJoin(
				responseTypeTable,
				eq(disasterEventResponseTable.responseTypeId, responseTypeTable.id),
			)
			.where(
				and(
					eq(disasterEventResponseTable.id, id),
					eq(disasterEventTable.countryAccountsId, countryAccountsId),
				),
			);

		return rows[0] ?? null;
	},
	listByDisasterEventId: async (
		disasterEventId: string,
		tx?: Tx,
	): Promise<DisasterEventResponseListItem[]> => {
		const rows = await (tx ?? dr)
			.select({
				id: disasterEventResponseTable.id,
				disasterEventId: disasterEventResponseTable.disasterEventId,
				responseTypeId: disasterEventResponseTable.responseTypeId,
				responseDate: disasterEventResponseTable.responseDate,
				coverage: disasterEventResponseTable.coverage,
				description: disasterEventResponseTable.description,
				responseType: responseTypeTable.type,
			})
			.from(disasterEventResponseTable)
			.innerJoin(
				responseTypeTable,
				eq(disasterEventResponseTable.responseTypeId, responseTypeTable.id),
			)
			.where(eq(disasterEventResponseTable.disasterEventId, disasterEventId))
			.orderBy(asc(disasterEventResponseTable.responseDate));

		return rows;
	},
	getById: (id: string, tx?: Tx) => {
		return (tx ?? dr).query.disasterEventResponseTable.findFirst({
			where: eq(disasterEventResponseTable.id, id),
		});
	},
	getByIdAndDisasterEventId: (
		id: string,
		disasterEventId: string,
		tx?: Tx,
	) => {
		return (tx ?? dr).query.disasterEventResponseTable.findFirst({
			where: and(
				eq(disasterEventResponseTable.id, id),
				eq(disasterEventResponseTable.disasterEventId, disasterEventId),
			),
		});
	},
	createMany: async (data: InsertDisasterEventResponse[], tx?: Tx) => {
		if (data.length === 0) {
			return [] as SelectDisasterEventResponse[];
		}

		return (tx ?? dr)
			.insert(disasterEventResponseTable)
			.values(data)
			.returning();
	},
	createOne: async (data: InsertDisasterEventResponse, tx?: Tx) => {
		const rows = await (tx ?? dr)
			.insert(disasterEventResponseTable)
			.values(data)
			.returning();

		return rows[0] ?? null;
	},
	updateById: async (
		id: string,
		data: Partial<InsertDisasterEventResponse>,
		tx?: Tx,
	) => {
		const rows = await (tx ?? dr)
			.update(disasterEventResponseTable)
			.set(data)
			.where(eq(disasterEventResponseTable.id, id))
			.returning();

		return rows[0] ?? null;
	},
	deleteById: (id: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventResponseTable)
			.where(eq(disasterEventResponseTable.id, id));
	},
	deleteByDisasterEventId: (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventResponseTable)
			.where(eq(disasterEventResponseTable.disasterEventId, disasterEventId));
	},
	deleteByDisasterEventIdAndResponseTypeId: (
		disasterEventId: string,
		responseTypeId: string,
		tx?: Tx,
	) => {
		return (tx ?? dr)
			.delete(disasterEventResponseTable)
			.where(
				and(
					eq(disasterEventResponseTable.disasterEventId, disasterEventId),
					eq(disasterEventResponseTable.responseTypeId, responseTypeId),
				),
			);
	},
};
