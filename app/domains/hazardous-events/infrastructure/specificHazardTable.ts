import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { hazardClusterTable } from "./hazardClusterTable";
import { textContentTable } from "~/domains/shared/infrastructure/textContentTable";

export const specificHazardTable = pgTable("specific_hazard", {
	// No DB default: ids are deterministic hashes of legacy source refs, assigned by the
	// HIPs taxonomy migration, not generated on insert.
	id: uuid("id").primaryKey(),
	nameTextContentId: uuid("name_text_content_id")
		.notNull()
		.references(() => textContentTable.id),
	code: text("code").notNull(),
	hazardClusterId: uuid("hazard_cluster_id")
		.notNull()
		.references(() => hazardClusterTable.id),
	sourceRefId: text("source_ref_id").unique(),
	descriptionTextContentId: uuid("description_text_content_id").references(
		() => textContentTable.id,
	),
});

export type SelectSpecificHazard = typeof specificHazardTable.$inferSelect;
export type InsertSpecificHazard = typeof specificHazardTable.$inferInsert;
