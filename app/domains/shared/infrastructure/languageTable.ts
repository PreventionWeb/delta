import { sql } from "drizzle-orm";
import { check, pgTable, text, varchar } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";

export const languageTable = pgTable(
	"language",
	{
		id: ourRandomUUID(),
		languageName: text("language_name").notNull().unique(),
		// varchar(35) is RFC 5646 §4.4.1's worst-case single-tag buffer size.
		languageCd: varchar("language_cd", { length: 35 }).notNull().unique(),
	},
	(table) => [
		// Mirrors resolveLocale.ts's BCP_47_PATTERN (Decision Q3) -- one shape, both layers.
		check(
			"language_cd_format_check",
			sql`${table.languageCd} ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'`,
		),
	],
);

export type SelectLanguage = typeof languageTable.$inferSelect;
export type InsertLanguage = typeof languageTable.$inferInsert;
