import { AnyPgColumn, index, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "../../utils/drizzleUtil";
import { disasterEventAssessmentTable } from "./disasterEventAssessmentTable";
import { sectorTable } from "./sectorTable";

export const disasterEventAssessmentSectorTable = pgTable(
	"disaster_event_assessment_sector",
	{
		id: ourRandomUUID(),
		disasterEventAssessmentId: uuid("disaster_event_assessment_id")
			.notNull()
			.references((): AnyPgColumn => disasterEventAssessmentTable.id, {
				onDelete: "cascade",
			}),
		sectorId: uuid("sector_id")
			.notNull()
			.references((): AnyPgColumn => sectorTable.id),
	},
	(table) => ({
		disEventAssessmentSectorUnique: unique(
			"dis_event_assessment_sector_assessment_id_sector_id_unique",
		).on(table.disasterEventAssessmentId, table.sectorId),
		disEventAssessmentSectorAssessmentIdx: index(
			"dis_event_assessment_sector_assessment_id_idx",
		).on(table.disasterEventAssessmentId),
		disEventAssessmentSectorSectorIdx: index(
			"dis_event_assessment_sector_sector_id_idx",
		).on(table.sectorId),
	}),
);

export type SelectDisasterEventAssessmentSector =
	typeof disasterEventAssessmentSectorTable.$inferSelect;
export type InsertDisasterEventAssessmentSector =
	typeof disasterEventAssessmentSectorTable.$inferInsert;
