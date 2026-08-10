import { pgTable, text, unique } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "../../utils/drizzleUtil";

export const responseTypeTable = pgTable(
	"response_type",
	{
		id: ourRandomUUID(),
		type: text("type").notNull(),
	},
	(table) => ({
		responseTypeUnique: unique("response_type_type_unique").on(table.type),
	}),
);

export type SelectResponseType = typeof responseTypeTable.$inferSelect;
export type InsertResponseType = typeof responseTypeTable.$inferInsert;
