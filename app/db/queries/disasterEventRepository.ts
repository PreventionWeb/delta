import { and, eq, ilike, or, sql } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import { disasterEventTable, InsertDisasterEvent } from "~/drizzle/schema";
import { DisasterRecordsRepository } from "~/db/queries/disasterRecordsRepository";

export const DisasterEventRepository = {
	deleteById: (id: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventTable)
			.where(eq(disasterEventTable.id, id))
			.returning({ id: disasterEventTable.id });
	},

	deleteByIdAndCountryAccountsId: (
		id: string,
		countryAccountsId: string,
		tx?: Tx,
	) => {
		return (tx ?? dr)
			.delete(disasterEventTable)
			.where(
				and(
					eq(disasterEventTable.id, id),
					eq(disasterEventTable.countryAccountsId, countryAccountsId),
				),
			)
			.returning({ id: disasterEventTable.id });
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
			recordStatus?: string;
			recordStatuses?: string[];
			hazardType?: string;
			hazardCluster?: string;
			specificHazard?: string;
			createdByUserId?: string;
			pendingMyAction?: { userId: string };
		},
		tx?: Tx,
	) => {
		const offset = page ? (page - 1) * (pageSize || 25) : undefined;
		const db = tx ?? dr;
		const disasterEventName = filters?.disasterEventName?.trim();
		const recordingOrganization = filters?.recordingOrganization?.trim();
		const recordStatus = filters?.recordStatus?.trim();
		const recordStatuses = filters?.recordStatuses
			?.map((status) => status.trim())
			.filter(Boolean);
		const hazardType = filters?.hazardType?.trim();
		const hazardCluster = filters?.hazardCluster?.trim();
		const specificHazard = filters?.specificHazard?.trim();
		const createdByUserId = filters?.createdByUserId?.trim();
		const pendingMyAction = filters?.pendingMyAction;

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
			recordStatus
				? eq(disasterEventTable.approvalStatus, recordStatus as any)
				: recordStatuses && recordStatuses.length > 0
					? or(
							...recordStatuses.map((status) =>
								eq(disasterEventTable.approvalStatus, status as any),
							),
						)
					: undefined,
			hazardType ? eq(disasterEventTable.hipTypeId, hazardType) : undefined,
			hazardCluster
				? eq(disasterEventTable.hipClusterId, hazardCluster)
				: undefined,
			specificHazard
				? eq(disasterEventTable.hipHazardId, specificHazard)
				: undefined,
			createdByUserId
				? eq(disasterEventTable.createdByUserId, createdByUserId)
				: undefined,
			pendingMyAction
				? sql`EXISTS (
						SELECT 1 FROM entity_validation_assignment
						WHERE entity_validation_assignment.entity_id = ${disasterEventTable.id}
						  AND entity_validation_assignment.entity_type = 'disaster_event'
						  AND entity_validation_assignment.assigned_to_user_id = ${pendingMyAction.userId}
					)`
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
