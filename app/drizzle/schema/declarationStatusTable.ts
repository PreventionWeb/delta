import { pgTable, text, unique } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "../../utils/drizzleUtil";

export const declarationStatusTable = pgTable(
	"declaration_status",
	{
		id: ourRandomUUID(),
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
