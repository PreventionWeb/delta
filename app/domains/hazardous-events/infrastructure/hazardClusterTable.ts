import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { hazardTypeTable } from "./hazardTypeTable";
import { textContentTable } from "~/domains/shared/infrastructure/textContentTable";

export const hazardClusterTable = pgTable("hazard_cluster", {
	id: ourRandomUUID(),
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
