import { sql } from "drizzle-orm";
import { pgTable, uuid, timestamp, unique, index } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { hazardDriverTable } from "./hazardDriverTable";

export const hazardousEventHazardDriverTable = pgTable(
	"hazardous_event_hazard_driver",
	{
		id: ourRandomUUID(),
		hazardousEventId: uuid("hazardous_event_id")
			.notNull()
			.references(() => hazardousEventTable.id, { onDelete: "cascade" }),
		hazardDriverId: uuid("hazard_driver_id")
			.notNull()
			.references(() => hazardDriverTable.id, { onDelete: "cascade" }),
		// inline withTimezone (not createdUpdatedTimestamps) per ADR-002
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => [
		unique("hazardous_event_hazard_driver_event_id_driver_id_unique").on(
			table.hazardousEventId,
			table.hazardDriverId,
		),
		index("hazardous_event_hazard_driver_event_id_idx").on(
			table.hazardousEventId,
		),
		index("hazardous_event_hazard_driver_driver_id_idx").on(
			table.hazardDriverId,
		),
	],
);

export type SelectHazardousEventHazardDriver =
	typeof hazardousEventHazardDriverTable.$inferSelect;
export type InsertHazardousEventHazardDriver =
	typeof hazardousEventHazardDriverTable.$inferInsert;
