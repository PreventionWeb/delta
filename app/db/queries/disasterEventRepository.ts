import { and, eq, ilike, or } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import { disasterEventTable, InsertDisasterEvent } from "~/drizzle/schema";
import { DisasterRecordsRepository } from "~/db/queries/disasterRecordsRepository";

export const DisasterEventRepository = {
	delete: (id: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventTable)
			.where(eq(disasterEventTable.id, id));
	},

	deleteByCountryAccountId: (countryAccountsId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventTable)
			.where(eq(disasterEventTable.countryAccountsId, countryAccountsId));
	},
	getByCountryAccountsId: (countryAccountsId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disasterEventTable)
			.where(eq(disasterEventTable.countryAccountsId, countryAccountsId));
	},
	getByCountryAccountsIdPaginated: async (
		countryAccountsId: string,
		page?: number,
		pageSize?: number,
		filters?: {
			disasterEventName?: string;
			recordingOrganization?: string;
		},
		tx?: Tx,
	) => {
		const offset = page ? (page - 1) * (pageSize || 25) : undefined;
		const db = tx ?? dr;
		const disasterEventName = filters?.disasterEventName?.trim();
		const recordingOrganization = filters?.recordingOrganization?.trim();

		const whereClause = and(
			eq(disasterEventTable.countryAccountsId, countryAccountsId),
			disasterEventName
				? or(
						ilike(disasterEventTable.nameNational, `%${disasterEventName}%`),
						ilike(
							disasterEventTable.nameGlobalOrRegional,
							`%${disasterEventName}%`,
						),
					)
				: undefined,
			recordingOrganization
				? ilike(
						disasterEventTable.recordingInstitution,
						`%${recordingOrganization}%`,
					)
				: undefined,
		);

		const [items, countResult] = await Promise.all([
			db.query.disasterEventTable.findMany({
				where: whereClause,
				...(offset !== undefined && { limit: pageSize, offset }),
			}),
			db.$count(disasterEventTable, whereClause),
		]);

		const linkedRecordsCounts = await Promise.all(
			items.map((item) =>
				DisasterRecordsRepository.countByDisasterEventId(item.id, db),
			),
		);

		const itemsWithDisasterRecordsCounts = items.map((item, index) => ({
			...item,
			linkedRecordsCount: linkedRecordsCounts[index],
		}));

		return {
			items: itemsWithDisasterRecordsCounts,
			pagination: {
				totalItems: countResult,
				itemsOnThisPage: itemsWithDisasterRecordsCounts.length,
				page: page || 1,
				pageSize: pageSize || 25,
			},
		};
	},
	createMany: (data: InsertDisasterEvent[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(disasterEventTable)
			.values(data)
			.returning()
			.execute();
	},
};
