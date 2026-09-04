import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { hazardClusterTable } from "./hazardClusterTable";

export const specificHazardTable = pgTable("specific_hazard", {
	id: ourRandomUUID(),
	name: text("name").notNull(),
	code: text("code").notNull(),
	hazardClusterId: uuid("hazard_cluster_id")
		.notNull()
		.references(() => hazardClusterTable.id),
});

export type SelectSpecificHazard = typeof specificHazardTable.$inferSelect;
export type InsertSpecificHazard = typeof specificHazardTable.$inferInsert;
