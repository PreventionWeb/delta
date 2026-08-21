import { and, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterEventTable,
	InsertDisasterEvent,
	organizationTable,
} from "~/drizzle/schema";
import { DisasterEventDivisionRepository } from "~/db/queries/disasterEventDivisionRepository";
import { DisasterRecordsRepository } from "~/db/queries/disasterRecordsRepository";
import { OrganizationRepository } from "./organizationRepository";

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
	existsByIdAndCountryAccountsId: async (
		id: string,
		countryAccountsId: string,
		tx?: Tx,
	) => {
		const row = await (tx ?? dr).query.disasterEventTable.findFirst({
			columns: { id: true },
			where: and(
				eq(disasterEventTable.id, id),
				eq(disasterEventTable.countryAccountsId, countryAccountsId),
			),
		});
		return Boolean(row);
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
				? sql`EXISTS (
						SELECT 1 FROM ${organizationTable}
						WHERE "organization"."id" = ${disasterEventTable.recordingOrganizationId}
							AND "organization"."country_accounts_id" = ${disasterEventTable.countryAccountsId}
							AND "organization"."name" ILIKE ${`%${recordingOrganization}%`}
					)`
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
				orderBy: [desc(disasterEventTable.updatedAt)],
				...(offset !== undefined && { limit: pageSize, offset }),
			}),
			db.$count(disasterEventTable, whereClause),
		]);

		const linkedRecordsCounts = await Promise.all(
			items.map((item) =>
				DisasterRecordsRepository.countByDisasterEventId(item.id, db),
			),
		);

		const linkedRecordingOrganization = await Promise.all(
			items.map((item) =>
				item.recordingOrganizationId
					? OrganizationRepository.getById(item.recordingOrganizationId, db)
					: null,
			),
		);

		const itemsWithDisasterRecordsCounts = items.map((item, index) => ({
			...item,
			linkedRecordsCount: linkedRecordsCounts[index],
			linkedRecordingOrganization: linkedRecordingOrganization[index],
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
	getLinkableOptionsData: async (
		countryAccountsId: string,
		currentItemId: string | undefined,
		keyword?: string,
		tx?: Tx,
	) => {
		const db = tx ?? dr;
		const normalizedKeyword = keyword?.trim();
		const shouldSearch = Boolean(normalizedKeyword);
		const searchTerm = normalizedKeyword ? `%${normalizedKeyword}%` : "";

		const whereClause = shouldSearch
			? and(
				eq(disasterEventTable.countryAccountsId, countryAccountsId),
				currentItemId ? ne(disasterEventTable.id, currentItemId) : undefined,
				or(
					ilike(disasterEventTable.nameNational, searchTerm),
					ilike(disasterEventTable.nameGlobalOrRegional, searchTerm),
					ilike(disasterEventTable.nationalDisasterId, searchTerm),
					ilike(disasterEventTable.glide, searchTerm),
					sql`exists (
						select 1
						from disaster_event_division ded
						join division d on d.id = ded.division_id
						where ded.disaster_event_id = ${disasterEventTable.id}
						and d.country_accounts_id = ${countryAccountsId}
						and cast(d.name as text) ilike ${searchTerm}
					)`,
					sql`cast(${disasterEventTable.id} as text) ilike ${searchTerm}`,
					sql`cast(${disasterEventTable.startDate} as text) ilike ${searchTerm}`,
					sql`cast(${disasterEventTable.endDate} as text) ilike ${searchTerm}`,
					sql`cast(${disasterEventTable.approvalStatus} as text) ilike ${searchTerm}`,
					sql`exists (
						select 1
						from hip_hazard hh
						where hh.id = ${disasterEventTable.hipHazardId}
						and cast(hh.name as text) ilike ${searchTerm}
					)`,
					sql`exists (
						select 1
						from hip_cluster hc
						where hc.id = ${disasterEventTable.hipClusterId}
						and cast(hc.name as text) ilike ${searchTerm}
					)`,
					sql`exists (
						select 1
						from hip_class ht
						where ht.id = ${disasterEventTable.hipTypeId}
						and cast(ht.name as text) ilike ${searchTerm}
					)`,
				),
			)
			: and(
				eq(disasterEventTable.countryAccountsId, countryAccountsId),
				currentItemId ? ne(disasterEventTable.id, currentItemId) : undefined,
			);

		const disasterEvents = await db.query.disasterEventTable.findMany({
			columns: {
				id: true,
				nameNational: true,
				nameGlobalOrRegional: true,
				startDate: true,
				endDate: true,
			},
			with: {
				hipHazard: {
					columns: {
						name: true,
						code: true,
					},
				},
				hipCluster: {
					columns: {
						name: true,
					},
				},
				hipType: {
					columns: {
						name: true,
					},
				},
			},
			where: whereClause,
			orderBy: [desc(disasterEventTable.updatedAt)],
			limit: shouldSearch ? 500 : 200,
		});

		const disasterEventIds = disasterEvents.map((event) => event.id);
		const divisionRows =
			await DisasterEventDivisionRepository.getDivisionNamesByDisasterEventIds(
				countryAccountsId,
				disasterEventIds,
				db,
			);

		const divisionNamesByDisasterEventId = new Map<
			string,
			Record<string, string>[]
		>();
		for (const row of divisionRows) {
			if (!row.divisionName) {
				continue;
			}

			const current =
				divisionNamesByDisasterEventId.get(row.disasterEventId) || [];
			current.push(row.divisionName as Record<string, string>);
			divisionNamesByDisasterEventId.set(row.disasterEventId, current);
		}

		return {
			disasterEvents,
			divisionNamesByDisasterEventId,
		};
	},
};
