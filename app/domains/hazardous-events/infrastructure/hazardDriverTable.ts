import { sql } from "drizzle-orm";
import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { countryAccountsTable } from "~/drizzle/schema/countryAccountsTable";

export const hazardDriverTable = pgTable(
	"hazard_driver",
	{
		id: ourRandomUUID(),
		name: text("name").notNull(),
		countryAccountsId: uuid("country_accounts_id")
			.notNull()
			.references(() => countryAccountsTable.id, { onDelete: "cascade" }),
		// inline withTimezone (not createdUpdatedTimestamps) per ADR-002
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => [
		index("hazard_driver_country_accounts_id_idx").on(table.countryAccountsId),
	],
);

export type SelectHazardDriver = typeof hazardDriverTable.$inferSelect;
export type InsertHazardDriver = typeof hazardDriverTable.$inferInsert;
