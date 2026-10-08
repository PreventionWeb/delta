import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { hipsVersionTable } from "./hipsVersionTable";
import { textContentTable } from "~/domains/shared/infrastructure/textContentTable";

export const hazardTypeTable = pgTable("hazard_type", {
	id: ourRandomUUID(),
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
