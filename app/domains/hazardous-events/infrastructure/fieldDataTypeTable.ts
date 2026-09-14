import { pgTable, text, unique } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";

export const fieldDataTypeTable = pgTable(
	"field_data_type",
	{
		id: ourRandomUUID(),
		type: text("type").notNull(),
	},
	(table) => [unique("field_data_type_type_unique").on(table.type)],
);

export type SelectFieldDataType = typeof fieldDataTypeTable.$inferSelect;
export type InsertFieldDataType = typeof fieldDataTypeTable.$inferInsert;
