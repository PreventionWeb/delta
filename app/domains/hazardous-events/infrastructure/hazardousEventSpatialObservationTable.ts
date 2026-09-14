import { sql } from "drizzle-orm";
import {
	pgTable,
	uuid,
	text,
	timestamp,
	index,
	unique,
} from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";

export const hazardousEventSpatialObservationTable = pgTable(
	"hazardous_event_spatial_observation",
	{
		id: ourRandomUUID(),
		hazardousEventId: uuid("hazardous_event_id")
			.notNull()
			.references(() => hazardousEventTable.id, { onDelete: "cascade" }),
		observationTime: timestamp("observation_time", {
			withTimezone: true,
		}).notNull(),
		note: text("note"),
		// inline withTimezone (not createdUpdatedTimestamps) per ADR-002
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => [
		index("hazardous_event_spatial_observation_hazardous_event_id_idx").on(
			table.hazardousEventId,
		),
		// DB-level defense-in-depth; the domain-layer conflict check (3d/5e) is authoritative
		unique("hazardous_event_spatial_observation_event_id_time_unique").on(
			table.hazardousEventId,
			table.observationTime,
		),
	],
);

export type SelectHazardousEventSpatialObservation =
	typeof hazardousEventSpatialObservationTable.$inferSelect;
export type InsertHazardousEventSpatialObservation =
	typeof hazardousEventSpatialObservationTable.$inferInsert;
