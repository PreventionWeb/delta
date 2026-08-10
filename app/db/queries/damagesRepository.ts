import { eq, inArray, sql } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import { damagesTable, InsertDamages, assetTable, sectorTable } from "~/drizzle/schema";
import { sectorTreeDisplayNameSql } from "~/db/queries/sector";

export const DamagesRepository = {
	delete: (id: string, tx?: Tx) => {
		return (tx ?? dr).delete(damagesTable).where(eq(damagesTable.id, id));
	},

	deleteByRecordId: (recordId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(damagesTable)
			.where(eq(damagesTable.recordId, recordId));
	},
	getByRecordIdWithInfo: (recordId: string, lang: string, tx?: Tx) => {
		return (tx ?? dr)
			.select({
				id: damagesTable.id,
				recordId: damagesTable.recordId,
				sectorId: damagesTable.sectorId,
				sectorName: sql<string>`dts_jsonb_localized(${sectorTable.name}, ${lang})`.as(
					"sectorName",
				),
				sectorTreeDisplayName: sectorTreeDisplayNameSql(damagesTable.sectorId, lang).as("sectorTreeDisplayName"),
				assetId: damagesTable.assetId,
				assetName: sql<string>`CASE
					WHEN ${assetTable.isBuiltIn} THEN dts_jsonb_localized(${assetTable.builtInName}, ${lang})
					ELSE ${assetTable.customName}
				END`.as("assetName"),
				unit: damagesTable.unit,

				pdDamageAmount: damagesTable.pdDamageAmount,
				pdRepairCostUnit: damagesTable.pdRepairCostUnit,
				pdRepairCostUnitCurrency: damagesTable.pdRepairCostUnitCurrency,
				pdRepairCostTotal: damagesTable.pdRepairCostTotal,
				pdRecoveryCostUnit: damagesTable.pdRecoveryCostUnit,
				pdRecoveryCostUnitCurrency: damagesTable.pdRecoveryCostUnitCurrency,
				pdRecoveryCostTotal: damagesTable.pdRecoveryCostTotal,
				pdRecoveryCostTotalOverride: damagesTable.pdRecoveryCostTotalOverride,

				tdDamageAmount: damagesTable.tdDamageAmount,
				tdReplacementCostUnit: damagesTable.tdReplacementCostUnit,
				tdReplacementCostUnitCurrency: damagesTable.tdReplacementCostUnitCurrency,
				tdReplacementCostTotal: damagesTable.tdReplacementCostTotal,
				tdRecoveryCostUnit: damagesTable.tdRecoveryCostUnit,
				tdRecoveryCostUnitCurrency: damagesTable.tdRecoveryCostUnitCurrency,
				tdRecoveryCostTotal: damagesTable.tdRecoveryCostTotal,
				tdRecoveryCostTotalOverride: damagesTable.tdRecoveryCostTotalOverride,

				totalDamageAmount: damagesTable.totalDamageAmount,
				totalDamageAmountOverride: damagesTable.totalDamageAmountOverride,

				totalRecovery: damagesTable.totalRecovery,
				totalRecoveryOverride: damagesTable.totalRecoveryOverride,

				totalRepairReplacement: damagesTable.totalRepairReplacement,
				totalRepairReplacementOverride: damagesTable.totalRepairReplacementOverride,
			})
			.from(damagesTable)
			.leftJoin(assetTable, eq(damagesTable.assetId, assetTable.id))
			.leftJoin(sectorTable, eq(damagesTable.sectorId, sectorTable.id))
			.where(eq(damagesTable.recordId, recordId));
	},
	getByRecordId: (recordId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(damagesTable)
			.where(eq(damagesTable.recordId, recordId));
	},
	getByRecordIds: (recordIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(damagesTable)
			.where(inArray(damagesTable.recordId, recordIds));
	},
	deleteByRecordIds: (recordIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(damagesTable)
			.where(inArray(damagesTable.recordId, recordIds));
	},
	createMany: (data: InsertDamages[], tx?: Tx) => {
		return (tx ?? dr).insert(damagesTable).values(data).returning().execute();
	},
};
