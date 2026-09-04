import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { hazardTypeTable } from "./hazardTypeTable";

export const hazardClusterTable = pgTable("hazard_cluster", {
	id: ourRandomUUID(),
	name: text("name").notNull(),
	hazardTypeId: uuid("hazard_type_id")
		.notNull()
		.references(() => hazardTypeTable.id),
});

export type SelectHazardCluster = typeof hazardClusterTable.$inferSelect;
export type InsertHazardCluster = typeof hazardClusterTable.$inferInsert;
