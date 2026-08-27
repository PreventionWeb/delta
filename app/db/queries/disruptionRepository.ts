import { eq, inArray, sql } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import { disruptionTable, InsertDisruption, sectorTable } from "~/drizzle/schema";
import { sectorTreeDisplayNameSql } from "~/db/queries/sector";

export const DisruptionRepository = {
	delete: (id: string, tx?: Tx) => {
		return (tx ?? dr).delete(disruptionTable).where(eq(disruptionTable.id, id));
	},

	deleteByRecordId: (recordId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disruptionTable)
			.where(eq(disruptionTable.recordId, recordId));
	},
	getByRecordIdWithInfo: (recordId: string, lang: string, tx?: Tx) => {
		return (tx ?? dr)
			.select({
				id: disruptionTable.id,
				recordId: disruptionTable.recordId,
				sectorId: disruptionTable.sectorId,
				sectorName: sql<string>`dts_jsonb_localized(${sectorTable.name}, ${lang})`.as(
					"sectorName",
				),
				durationDays: disruptionTable.durationDays,
				durationHours: disruptionTable.durationHours,
				usersAffected: disruptionTable.usersAffected,
				peopleAffected: disruptionTable.peopleAffected,
				comment: disruptionTable.comment,
				responseOperation: disruptionTable.responseOperation,
				responseCost: disruptionTable.responseCost,
				responseCurrency: disruptionTable.responseCurrency,
				sectorTreeDisplayName: sectorTreeDisplayNameSql(disruptionTable.sectorId, lang).as("sectorTreeDisplayName"),
			})
			.from(disruptionTable)
			.leftJoin(sectorTable, eq(disruptionTable.sectorId, sectorTable.id))
			.where(eq(disruptionTable.recordId, recordId));
	},
	getByRecordId: (recordId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disruptionTable)
			.where(eq(disruptionTable.recordId, recordId));
	},
	getByRecordIds: (recordIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disruptionTable)
			.where(inArray(disruptionTable.recordId, recordIds));
	},
	deleteByRecordIds: (recordIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(disruptionTable)
			.where(inArray(disruptionTable.recordId, recordIds));
	},
	createMany: (data: InsertDisruption[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(disruptionTable)
			.values(data)
			.returning()
			.execute();
	},
};
