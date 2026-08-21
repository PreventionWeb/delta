import { pgTable, text, unique } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "../../utils/drizzleUtil";

export const assessmentTypeTable = pgTable(
	"assessment_type",
	{
		id: ourRandomUUID(),
		type: text("type").notNull(),
	},
	(table) => ({
		assessmentTypeUnique: unique("assessment_type_type_unique").on(table.type),
	}),
);

export type SelectAssessmentType = typeof assessmentTypeTable.$inferSelect;
export type InsertAssessmentType = typeof assessmentTypeTable.$inferInsert;
