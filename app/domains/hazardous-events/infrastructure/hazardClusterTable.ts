import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { hazardTypeTable } from "./hazardTypeTable";
import { textContentTable } from "~/domains/shared/infrastructure/textContentTable";

export const hazardClusterTable = pgTable("hazard_cluster", {
	// No DB default: ids are deterministic hashes of legacy source refs, assigned by the
	// HIPs taxonomy migration, not generated on insert.
	id: uuid("id").primaryKey(),
	nameTextContentId: uuid("name_text_content_id")
		.notNull()
		.references(() => textContentTable.id),
	hazardTypeId: uuid("hazard_type_id")
		.notNull()
		.references(() => hazardTypeTable.id),
	sourceRefId: text("source_ref_id").unique(),
});

export type SelectHazardCluster = typeof hazardClusterTable.$inferSelect;
export type InsertHazardCluster = typeof hazardClusterTable.$inferInsert;
