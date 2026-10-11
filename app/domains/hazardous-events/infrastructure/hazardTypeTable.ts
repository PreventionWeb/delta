import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { hipsVersionTable } from "./hipsVersionTable";
import { textContentTable } from "~/domains/shared/infrastructure/textContentTable";

export const hazardTypeTable = pgTable("hazard_type", {
	// No DB default: ids are deterministic hashes of legacy source refs, assigned by the
	// HIPs taxonomy migration, not generated on insert.
	id: uuid("id").primaryKey(),
	nameTextContentId: uuid("name_text_content_id")
		.notNull()
		.references(() => textContentTable.id),
	// Named for the referenced table — diagram's "hip_version_id" is a typo (2b design.md Decision 2).
	hipsVersionId: uuid("hips_version_id")
		.notNull()
		.references(() => hipsVersionTable.id),
	sourceRefId: text("source_ref_id").unique(),
});

export type SelectHazardType = typeof hazardTypeTable.$inferSelect;
export type InsertHazardType = typeof hazardTypeTable.$inferInsert;
