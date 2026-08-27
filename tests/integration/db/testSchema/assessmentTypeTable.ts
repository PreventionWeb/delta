import { pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

export const assessmentTypeTable = pgTable(
	"assessment_type",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		type: text("type").notNull(),
	},
	(table) => ({
		assessmentTypeUnique: unique("assessment_type_type_unique").on(table.type),
	}),
);

export type SelectAssessmentType = typeof assessmentTypeTable.$inferSelect;
export type InsertAssessmentType = typeof assessmentTypeTable.$inferInsert;
