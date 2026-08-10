import { pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

export const responseTypeTable = pgTable(
	"response_type",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		type: text("type").notNull(),
	},
	(table) => ({
		responseTypeUnique: unique("response_type_type_unique").on(table.type),
	}),
);

export type SelectResponseType = typeof responseTypeTable.$inferSelect;
export type InsertResponseType = typeof responseTypeTable.$inferInsert;
