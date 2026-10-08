import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { languageTable } from "./languageTable";
import { textContentTable } from "./textContentTable";

export const translationTable = pgTable(
	"translation",
	{
		id: ourRandomUUID(),
		textContentId: uuid("text_content_id")
			.notNull()
			.references(() => textContentTable.id, { onDelete: "cascade" }),
		languageId: uuid("language_id")
			.notNull()
			.references(() => languageTable.id),
		translation: text("translation").notNull(),
	},
	(table) => [
		uniqueIndex("translation_text_content_id_language_id_unique").on(
			table.textContentId,
			table.languageId,
		),
	],
);

export type SelectTranslation = typeof translationTable.$inferSelect;
export type InsertTranslation = typeof translationTable.$inferInsert;
