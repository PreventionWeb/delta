import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";

export const languageTable = pgTable(
	"language",
	{
		id: ourRandomUUID(),
		languageName: text("language_name").notNull().unique(),
		languageCd: text("language_cd").notNull().unique(),
	},
	(table) => [
		check(
			"language_language_cd_length_check",
			sql`char_length(${table.languageCd}) = 2`,
		),
	],
);

export type SelectLanguage = typeof languageTable.$inferSelect;
export type InsertLanguage = typeof languageTable.$inferInsert;
