import { sql } from "drizzle-orm";
import {
	pgTable,
	uuid,
	text,
	timestamp,
	index,
	customType,
} from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { hazardousEventSpatialObservationTable } from "./hazardousEventSpatialObservationTable";

const geometryType = customType<{ data: unknown }>({
	dataType: () => "geometry(Geometry,4326)",
});

export const hazardousEventSpatialObservationGeomTable = pgTable(
	"hazardous_event_spatial_observation_geom",
	{
		id: ourRandomUUID(),
		hazardousEventSpatialObservationId: uuid(
			"hazardous_event_spatial_observation_id",
		)
			.notNull()
			.references(() => hazardousEventSpatialObservationTable.id, {
				onDelete: "cascade",
			}),
		geom: geometryType("geom").notNull().$type<unknown>(),
		title: text("title"),
		// inline withTimezone (not createdUpdatedTimestamps) per ADR-002
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => [
		index("hazardous_event_spatial_observation_geom_observation_id_idx").on(
			table.hazardousEventSpatialObservationId,
		),
	],
);

export type SelectHazardousEventSpatialObservationGeom =
	typeof hazardousEventSpatialObservationGeomTable.$inferSelect;
export type InsertHazardousEventSpatialObservationGeom =
	typeof hazardousEventSpatialObservationGeomTable.$inferInsert;
