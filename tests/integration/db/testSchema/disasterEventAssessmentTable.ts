import {
	AnyPgColumn,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { assessmentTypeTable } from "./assessmentTypeTable";
import { disasterEventTable } from "./disasterEventTable";

export const disasterEventAssessmentTable = pgTable(
	"disaster_event_assessment",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		disasterEventId: uuid("disaster_event_id")
			.notNull()
			.references((): AnyPgColumn => disasterEventTable.id, {
				onDelete: "cascade",
			}),
		assessmentTypeId: uuid("assessment_type_id")
			.notNull()
			.references((): AnyPgColumn => assessmentTypeTable.id),
		coverage: text("coverage"),
		assessmentDate: timestamp("assessment_date", { withTimezone: true }),
		description: text("description"),
		otherSectors: text("other_sectors"),
	},
	(table) => [
		index("dis_event_assessment_event_id_idx").on(table.disasterEventId),
		index("dis_event_assessment_type_id_idx").on(table.assessmentTypeId),
	],
);

export type SelectDisasterEventAssessment =
	typeof disasterEventAssessmentTable.$inferSelect;
export type InsertDisasterEventAssessment =
	typeof disasterEventAssessmentTable.$inferInsert;
