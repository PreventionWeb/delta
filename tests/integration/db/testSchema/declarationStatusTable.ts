import { pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

export const declarationStatusTable = pgTable(
	"declaration_status",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		status: text("status").notNull(),
		description: text("description"),
	},
	(table) => ({
		declarationStatusUnique: unique("declaration_status_status_unique").on(
			table.status,
		),
	}),
);

export type SelectDeclarationStatus =
	typeof declarationStatusTable.$inferSelect;
export type InsertDeclarationStatus =
	typeof declarationStatusTable.$inferInsert;
