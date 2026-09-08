import { sql } from "drizzle-orm";
import { pgTable, uuid, timestamp, index, unique } from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { hazardousEventSpatialObservationTable } from "./hazardousEventSpatialObservationTable";

export const hazardousEventSpatialObservationDivisionTable = pgTable(
	"hazardous_event_spatial_observation_division",
	{
		id: ourRandomUUID(),
		hazardousEventSpatialObservationId: uuid(
			"hazardous_event_spatial_observation_id",
		)
			.notNull()
			.references(() => hazardousEventSpatialObservationTable.id, {
				onDelete: "cascade",
			}),
		// no onDelete: division is stable reference data, matches hazardousEventDivisionTable
		divisionId: uuid("division_id")
			.notNull()
			.references(() => divisionTable.id),
		// inline withTimezone (not createdUpdatedTimestamps) per ADR-002
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => [
		index("hazardous_event_spatial_observation_division_observation_id_idx").on(
			table.hazardousEventSpatialObservationId,
		),
		index("hazardous_event_spatial_observation_division_division_id_idx").on(
			table.divisionId,
		),
		unique("hazardous_event_spatial_observation_division_obs_div_unique").on(
			table.hazardousEventSpatialObservationId,
			table.divisionId,
		),
	],
);

export type SelectHazardousEventSpatialObservationDivision =
	typeof hazardousEventSpatialObservationDivisionTable.$inferSelect;
export type InsertHazardousEventSpatialObservationDivision =
	typeof hazardousEventSpatialObservationDivisionTable.$inferInsert;
