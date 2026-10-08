import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { hazardClusterTable } from "./hazardClusterTable";
import { textContentTable } from "~/domains/shared/infrastructure/textContentTable";

export const specificHazardTable = pgTable("specific_hazard", {
	id: ourRandomUUID(),
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
