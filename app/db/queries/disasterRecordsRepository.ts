import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import { disasterRecordsTable } from "~/drizzle/schema/disasterRecordsTable";
import { DisasterRecordsDivisionRepository } from "~/db/queries/disasterRecordsDivisionRepository";
import { divisionTable } from "~/drizzle/schema/divisionTable";

type InsertDisasterRecord = typeof disasterRecordsTable.$inferInsert;

export const DisasterRecordsRepository = {
	getByIdAndCountryAccountsId: (
		id: string,
		countryAccountsId: string,
		tx?: Tx,
	) => {
		if (!id || typeof id !== "string") return null;
		return (tx ?? dr)
			.select()
			.from(disasterRecordsTable)
			.where(
				and(
					eq(disasterRecordsTable.id, id),
					eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				),
			);
	},
	delete: (id: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterRecordsTable)
			.where(eq(disasterRecordsTable.id, id));
	},

	deleteByCountryAccountId: (countryAccountsId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterRecordsTable)
			.where(eq(disasterRecordsTable.countryAccountsId, countryAccountsId));
	},
	getByCountryAccountsId: (countryAccountsId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disasterRecordsTable)
			.where(eq(disasterRecordsTable.countryAccountsId, countryAccountsId));
	},
	countByDisasterEventId: (
		disasterEventId: string,
		tx?: Tx,
	): Promise<number> => {
		return (tx ?? dr).$count(
			disasterRecordsTable,
			eq(disasterRecordsTable.disasterEventId, disasterEventId),
		);
	},
	getIdsByDisasterEventIdAndCountryAccountsId: async (
		disasterEventId: string,
		countryAccountsId: string,
		tx?: Tx,
	): Promise<string[]> => {
		const rows = await (tx ?? dr)
			.select({ id: disasterRecordsTable.id })
			.from(disasterRecordsTable)
			.where(
				and(
					eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
					eq(disasterRecordsTable.disasterEventId, disasterEventId),
				),
			);

		return rows.map((row) => row.id).filter((id): id is string => Boolean(id));
	},
	unlinkByDisasterEventIdAndCountryAccountsId: (
		disasterEventId: string,
		countryAccountsId: string,
		tx?: Tx,
	) => {
		return (tx ?? dr)
			.update(disasterRecordsTable)
			.set({ disasterEventId: null })
			.where(
				and(
					eq(disasterRecordsTable.disasterEventId, disasterEventId),
					eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				),
			);
	},
	createMany: (data: InsertDisasterRecord[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(disasterRecordsTable)
			.values(data)
			.returning()
			.execute();
	},
	getLinkableOptionsData: async (
		countryAccountsId: string,
		keyword?: string,
		tx?: Tx,
	) => {
		const db = tx ?? dr;
		const normalizedKeyword = keyword?.trim();
		const shouldSearch = Boolean(normalizedKeyword);
		const searchTerm = normalizedKeyword ? `%${normalizedKeyword}%` : "";

		const whereClause = shouldSearch
			? and(
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				or(
					ilike(disasterRecordsTable.locationDesc, searchTerm),
					ilike(disasterRecordsTable.startDate, searchTerm),
					ilike(disasterRecordsTable.endDate, searchTerm),
					ilike(disasterRecordsTable.localWarnInst, searchTerm),
					ilike(disasterRecordsTable.primaryDataSource, searchTerm),
					ilike(disasterRecordsTable.otherDataSource, searchTerm),
					ilike(disasterRecordsTable.assessmentModes, searchTerm),
					ilike(disasterRecordsTable.originatorRecorderInst, searchTerm),
					ilike(disasterRecordsTable.validatedBy, searchTerm),
					ilike(disasterRecordsTable.checkedBy, searchTerm),
					ilike(disasterRecordsTable.dataCollector, searchTerm),
					sql`cast(${disasterRecordsTable.id} as text) ilike ${searchTerm}`,
					sql`cast(${disasterRecordsTable.disasterEventId} as text) ilike ${searchTerm}`,
					sql`cast(${disasterRecordsTable.approvalStatus} as text) ilike ${searchTerm}`,
					sql`exists (
						select 1
						from hip_hazard hh
						where hh.id = ${disasterRecordsTable.hipHazardId}
						and cast(hh.name as text) ilike ${searchTerm}
					)`,
					sql`exists (
						select 1
						from hip_cluster hc
						where hc.id = ${disasterRecordsTable.hipClusterId}
						and cast(hc.name as text) ilike ${searchTerm}
					)`,
					sql`exists (
						select 1
						from hip_class ht
						where ht.id = ${disasterRecordsTable.hipTypeId}
						and cast(ht.name as text) ilike ${searchTerm}
					)`,
					sql`exists (
						select 1
						from disaster_records_division drd
						join division d on d.id = drd.division_id
						where drd.disaster_record_id = ${disasterRecordsTable.id}
						and d.country_accounts_id = ${countryAccountsId}
						and cast(d.name as text) ilike ${searchTerm}
					)`,
				),
			)
			: eq(disasterRecordsTable.countryAccountsId, countryAccountsId);

		const disasterRecords = await db.query.disasterRecordsTable.findMany({
			columns: {
				id: true,
				disasterEventId: true,
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
				disasterEvent: {
					columns: {
						startDate: true,
						endDate: true,
					},
				},
			},
			where: whereClause,
			orderBy: [desc(disasterRecordsTable.updatedAt)],
			limit: shouldSearch ? 500 : 200,
		});

		const disasterRecordIds = disasterRecords
			.map((record) => record.id)
			.filter((id): id is string => Boolean(id));
		const divisionLinks = disasterRecordIds.length > 0
			? await DisasterRecordsDivisionRepository.getByDisasterRecordIds(
				disasterRecordIds,
				db,
			)
			: [];
		const divisionIds = Array.from(
			new Set(divisionLinks.map((row) => row.divisionId).filter(Boolean)),
		);
		const divisionDetails = divisionIds.length > 0
			? await db
				.select({ id: divisionTable.id, name: divisionTable.name })
				.from(divisionTable)
				.where(inArray(divisionTable.id, divisionIds))
			: [];

		const divisionsById = new Map(
			divisionDetails.map((row) => [row.id, row.name as Record<string, string>]),
		);

		const divisionNamesByDisasterRecordId = new Map<
			string,
			Record<string, string>[]
		>();
		for (const row of divisionLinks) {
			const divisionName = divisionsById.get(row.divisionId);
			if (!divisionName) {
				continue;
			}

			const current = divisionNamesByDisasterRecordId.get(row.disasterRecordId) || [];
			current.push(divisionName);
			divisionNamesByDisasterRecordId.set(row.disasterRecordId, current);
		}

		return {
			disasterRecords,
			divisionNamesByDisasterRecordId,
		};
	},
};
