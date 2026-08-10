import { eq, inArray, sql } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import { lossesTable, InsertLosses, sectorTable } from "~/drizzle/schema";
import { sectorTreeDisplayNameSql } from "~/db/queries/sector";

export const LossesRepository = {
	delete: (id: string, tx?: Tx) => {
		return (tx ?? dr).delete(lossesTable).where(eq(lossesTable.id, id));
	},

	deleteByRecordId: (recordId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(lossesTable)
			.where(eq(lossesTable.recordId, recordId));
	},
	getByRecordIdWithInfo: (recordId: string, lang: string, tx?: Tx) => {
		return (tx ?? dr)
			.select({
				id: lossesTable.id,
				recordId: lossesTable.recordId,
				sectorId: lossesTable.sectorId,
				sectorName: sql<string>`dts_jsonb_localized(${sectorTable.name}, ${lang})`.as(
					"sectorName",
				),
				sectorIsAgriculture: lossesTable.sectorIsAgriculture,
				type: sql<string | null>`CASE
					WHEN ${lossesTable.sectorIsAgriculture}
					THEN ${lossesTable.typeAgriculture}
					ELSE ${lossesTable.typeNotAgriculture}
				END`.as("type"),
				relatedTo: sql<string | null>`CASE
					WHEN ${lossesTable.sectorIsAgriculture}
					THEN ${lossesTable.relatedToAgriculture}
					ELSE ${lossesTable.relatedToNotAgriculture}
				END`.as("relatedTo"),
				description: lossesTable.description,
				publicUnit: lossesTable.publicUnit,
				publicUnits: lossesTable.publicUnits,
				publicCostUnit: lossesTable.publicCostUnit,
				publicCostUnitCurrency: lossesTable.publicCostUnitCurrency,
				publicCostTotal: lossesTable.publicCostTotal,
				publicCostTotalOverride: lossesTable.publicCostTotalOverride,

				privateUnit: lossesTable.privateUnit,
				privateUnits: lossesTable.privateUnits,
				privateCostUnit: lossesTable.privateCostUnit,
				privateCostUnitCurrency: lossesTable.privateCostUnitCurrency,
				privateCostTotal: lossesTable.privateCostTotal,
				privateCostTotalOverride: lossesTable.privateCostTotalOverride,

				costTotal: sql<number | null>`COALESCE(${lossesTable.publicCostTotal}, 0) + COALESCE(${lossesTable.privateCostTotal}, 0)`.as("costTotal"),

				
				sectorTreeDisplayName: sectorTreeDisplayNameSql(lossesTable.sectorId, lang).as("sectorTreeDisplayName"),
			})
			.from(lossesTable)
			.leftJoin(sectorTable, eq(lossesTable.sectorId, sectorTable.id))
			.where(eq(lossesTable.recordId, recordId));
	},
	getByRecordId: (recordId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(lossesTable)
			.where(eq(lossesTable.recordId, recordId));
	},
	getByRecordIds: (recordIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(lossesTable)
			.where(inArray(lossesTable.recordId, recordIds));
	},
	deleteByRecordIds: (recordIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(lossesTable)
			.where(inArray(lossesTable.recordId, recordIds));
	},
	createMany: (data: InsertLosses[], tx?: Tx) => {
		return (tx ?? dr).insert(lossesTable).values(data).returning().execute();
	},
};
