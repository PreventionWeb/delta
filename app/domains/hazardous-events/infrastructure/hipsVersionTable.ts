import { pgTable, text } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";

export const hipsVersionTable = pgTable("hips_version", {
	id: ourRandomUUID(),
	versionNo: text("version_no").notNull(),
});

export type SelectHipsVersion = typeof hipsVersionTable.$inferSelect;
export type InsertHipsVersion = typeof hipsVersionTable.$inferInsert;
