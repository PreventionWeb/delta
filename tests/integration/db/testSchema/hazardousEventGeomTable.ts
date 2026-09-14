import { relations } from "drizzle-orm";
import {
	pgTable,
	uuid,
	AnyPgColumn,
	text,
	customType,
} from "drizzle-orm/pg-core";
import { hazardousEventTable } from "./hazardousEventTable";
import { ourRandomUUID } from "~/utils/drizzleUtil";

const geometryType = customType<{ data: unknown }>({
	dataType: () => "geometry(Geometry,4326)",
});

export const hazardousEventGeomTable = pgTable("hazardous_event_geom", {
	id: ourRandomUUID(),
	hazardousEventId: uuid("hazardous_event_id")
		.notNull()
		.references((): AnyPgColumn => hazardousEventTable.id, {
			onDelete: "cascade",
		}),
	geom: geometryType("geom").notNull().$type<unknown>(),
	title: text("title"),
});

export const hazardousEventGeomRel = relations(
	hazardousEventGeomTable,
	({ one }) => ({
		hazardousEvent: one(hazardousEventTable, {
			fields: [hazardousEventGeomTable.hazardousEventId],
			references: [hazardousEventTable.id],
		}),
	}),
);

export type SelectHazardousEventGeom =
	typeof hazardousEventGeomTable.$inferSelect;
export type InsertHazardousEventGeom =
	typeof hazardousEventGeomTable.$inferInsert;
