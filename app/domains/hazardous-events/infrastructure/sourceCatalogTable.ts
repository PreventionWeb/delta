import { sql } from "drizzle-orm";
import {
	pgTable,
	text,
	uuid,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { countryAccountsTable } from "~/drizzle/schema/countryAccountsTable";

export const sourceCatalogTable = pgTable(
	"source_catalog",
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
		// One source name per tenant — prevents duplicate catalog entries.
		uniqueIndex("source_catalog_country_accounts_id_name_unique").on(
			table.countryAccountsId,
			table.name,
		),
	],
);

export type SelectSourceCatalog = typeof sourceCatalogTable.$inferSelect;
export type InsertSourceCatalog = typeof sourceCatalogTable.$inferInsert;
