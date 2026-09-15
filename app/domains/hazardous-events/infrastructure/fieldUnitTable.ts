import { pgTable, text, unique } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";

export const fieldUnitTable = pgTable(
	"field_unit",
	{
		id: ourRandomUUID(),
		unit: text("unit").notNull(),
	},
	(table) => [unique("field_unit_unit_unique").on(table.unit)],
);

export type SelectFieldUnit = typeof fieldUnitTable.$inferSelect;
export type InsertFieldUnit = typeof fieldUnitTable.$inferInsert;
