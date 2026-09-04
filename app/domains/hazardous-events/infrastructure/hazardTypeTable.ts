import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { hipsVersionTable } from "./hipsVersionTable";

export const hazardTypeTable = pgTable("hazard_type", {
	id: ourRandomUUID(),
	name: text("name").notNull(),
	// Named for the referenced table — diagram's "hip_version_id" is a typo (design.md Decision 2).
	hipsVersionId: uuid("hips_version_id")
		.notNull()
		.references(() => hipsVersionTable.id),
});

export type SelectHazardType = typeof hazardTypeTable.$inferSelect;
export type InsertHazardType = typeof hazardTypeTable.$inferInsert;
