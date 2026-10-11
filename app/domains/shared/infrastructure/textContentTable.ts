import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { languageTable } from "./languageTable";

export const textContentTable = pgTable("text_content", {
	id: ourRandomUUID(),
	originalText: text("original_text").notNull(),
	originalLanguageId: uuid("original_language_id")
		.notNull()
		.references(() => languageTable.id),
});

export type SelectTextContent = typeof textContentTable.$inferSelect;
export type InsertTextContent = typeof textContentTable.$inferInsert;
