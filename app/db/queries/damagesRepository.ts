import { eq, inArray, sql } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import { damagesTable, InsertDamages, assetTable, sectorTable } from "~/drizzle/schema";

export const DamagesRepository = {
	delete: (id: string, tx?: Tx) => {
		return (tx ?? dr).delete(damagesTable).where(eq(damagesTable.id, id));
	},

	deleteByRecordId: (recordId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(damagesTable)
			.where(eq(damagesTable.recordId, recordId));
	},
	getByRecordId: (recordId: string, lang: string, tx?: Tx) => {
		return (tx ?? dr)
			.select({
				id: damagesTable.id,
				recordId: damagesTable.recordId,
				sectorId: damagesTable.sectorId,
				sectorName: sql<string>`dts_jsonb_localized(${sectorTable.name}, ${lang})`.as(
					"sectorName",
				),
				sectorTreeDisplayName: sql<string>`(
					WITH RECURSIVE ParentCTE AS (
						SELECT
							s.id,
							dts_jsonb_localized(s.name, ${lang}) AS name,
							s.parent_id,
							dts_jsonb_localized(s.name, ${lang}) AS full_path
						FROM sector s
						WHERE s.id = ${damagesTable.sectorId}

						UNION ALL

						SELECT
							parent.id,
							dts_jsonb_localized(parent.name, ${lang}) AS name,
							parent.parent_id,
							dts_jsonb_localized(parent.name, ${lang}) || ' > ' || p.full_path AS full_path
						FROM sector parent
						INNER JOIN ParentCTE p ON parent.id = p.parent_id
					)
					SELECT full_path
					FROM ParentCTE
					WHERE parent_id IS NULL
				)`.as("sectorTreeDisplayName"),
				assetId: damagesTable.assetId,
				assetName: sql<string>`CASE
					WHEN ${assetTable.isBuiltIn} THEN dts_jsonb_localized(${assetTable.builtInName}, ${lang})
					ELSE ${assetTable.customName}
				END`.as("assetName"),
				unit: damagesTable.unit,
				totalDamageAmount: damagesTable.totalDamageAmount,
				totalRecovery: damagesTable.totalRecovery,
				totalRepairReplacement: damagesTable.totalRepairReplacement,
			})
			.from(damagesTable)
			.leftJoin(assetTable, eq(damagesTable.assetId, assetTable.id))
			.leftJoin(sectorTable, eq(damagesTable.sectorId, sectorTable.id))
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
