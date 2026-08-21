import { dr, Tx } from "~/db.server";
import { hazardousEventTable, InsertHazardousEvent } from "~/drizzle/schema";
import { HazardousEventDivisionRepository } from "~/db/queries/hazardousEventDivisionRepository";
import {
	and,
	desc,
	eq,
	ilike,
	notInArray,
	or,
	sql,
} from "drizzle-orm";

export const HazardousEventRepository = {
	delete: (id: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(hazardousEventTable)
			.where(eq(hazardousEventTable.id, id));
	},

	deleteByCountryAccountId: (countryAccountsId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(hazardousEventTable)
			.where(eq(hazardousEventTable.countryAccountsId, countryAccountsId));
	},

	getByCountryAccountsId: (countryAccountsId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.countryAccountsId, countryAccountsId));
	},

	createMany: (data: InsertHazardousEvent[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(hazardousEventTable)
			.values(data)
			.returning()
			.execute();
	},

	countByCountryAccountsId: (countryAccountsId: string): Promise<number> => {
		return dr.$count(
			hazardousEventTable,
			eq(hazardousEventTable.countryAccountsId, countryAccountsId),
		);
	},

	getLinkableOptionsData: async (
		countryAccountsId: string,
		blockedHazardousIds: string[] = [],
		keyword?: string,
		tx?: Tx,
	) => {
		const db = tx ?? dr;
		const normalizedKeyword = keyword?.trim();
		const shouldSearch = Boolean(normalizedKeyword);
		const searchTerm = normalizedKeyword ? `%${normalizedKeyword}%` : "";
		const normalizedBlockedIds = Array.from(
			new Set(blockedHazardousIds.map((id) => id.trim()).filter(Boolean)),
		);

		const whereClause = shouldSearch
			? and(
				eq(hazardousEventTable.countryAccountsId, countryAccountsId),
				normalizedBlockedIds.length > 0
					? notInArray(hazardousEventTable.id, normalizedBlockedIds)
					: undefined,
				or(
					ilike(hazardousEventTable.description, searchTerm),
					sql`exists (
						select 1
						from hip_hazard hh
						where hh.id = ${hazardousEventTable.hipHazardId}
						and cast(hh.name as text) ilike ${searchTerm}
					)`,
					sql`exists (
						select 1
						from hip_cluster hc
						where hc.id = ${hazardousEventTable.hipClusterId}
						and cast(hc.name as text) ilike ${searchTerm}
					)`,
					sql`exists (
						select 1
						from hip_class ht
						where ht.id = ${hazardousEventTable.hipTypeId}
						and cast(ht.name as text) ilike ${searchTerm}
					)`,
					sql`cast(${hazardousEventTable.id} as text) ilike ${searchTerm}`,
					sql`cast(${hazardousEventTable.startDate} as text) ilike ${searchTerm}`,
					sql`cast(${hazardousEventTable.endDate} as text) ilike ${searchTerm}`,
					sql`cast(${hazardousEventTable.approvalStatus} as text) ilike ${searchTerm}`,
					sql`exists (
						select 1
						from hazardous_event_division hed
						join division d on d.id = hed.division_id
						where hed.hazardous_event_id = ${hazardousEventTable.id}
						and d.country_accounts_id = ${countryAccountsId}
						and cast(d.name as text) ilike ${searchTerm}
					)`,
				),
			)
			: and(
				eq(hazardousEventTable.countryAccountsId, countryAccountsId),
				normalizedBlockedIds.length > 0
					? notInArray(hazardousEventTable.id, normalizedBlockedIds)
					: undefined,
			);

		const hazardousEvents = await db.query.hazardousEventTable.findMany({
			columns: {
				id: true,
				description: true,
				startDate: true,
				endDate: true,
				approvalStatus: true,
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
			orderBy: [desc(hazardousEventTable.updatedAt)],
			limit: shouldSearch ? 500 : 200,
		});

		const hazardousEventIds = hazardousEvents.map((event) => event.id);
		const divisionRows =
			await HazardousEventDivisionRepository.getDivisionNamesByHazardousEventIds(
				countryAccountsId,
				hazardousEventIds,
				db,
			);

		const divisionNamesByHazardousEventId = new Map<
			string,
			Record<string, string>[]
		>();
		for (const row of divisionRows) {
			if (!row.divisionName) {
				continue;
			}

			const current =
				divisionNamesByHazardousEventId.get(row.hazardousEventId) || [];
			current.push(row.divisionName as Record<string, string>);
			divisionNamesByHazardousEventId.set(row.hazardousEventId, current);
		}

		return {
			hazardousEvents,
			divisionNamesByHazardousEventId,
		};
	},
};
