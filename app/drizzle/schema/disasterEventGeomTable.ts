import { relations } from "drizzle-orm";
import {
	pgTable,
	uuid,
	AnyPgColumn,
	text,
	customType,
} from "drizzle-orm/pg-core";
import { disasterEventTable } from "./disasterEventTable";
import { ourRandomUUID } from "../../utils/drizzleUtil";

const geometryType = customType<{ data: unknown }>({
	dataType: () => "geometry(Geometry,4326)",
});

export const disasterEventGeomTable = pgTable("disaster_event_geom", {
	id: ourRandomUUID(),
	disasterEventId: uuid("disaster_event_id")
		.notNull()
		.references((): AnyPgColumn => disasterEventTable.id, {
			onDelete: "cascade",
		}),
	geom: geometryType("geom").notNull().$type<unknown>(),
	title: text("title"),
});

export const disasterEventGeomRel = relations(
	disasterEventGeomTable,
	({ one }) => ({
		disasterEvent: one(disasterEventTable, {
			fields: [disasterEventGeomTable.disasterEventId],
			references: [disasterEventTable.id],
		}),
	}),
);

export type SelectDisasterEventGeom =
	typeof disasterEventGeomTable.$inferSelect;
export type InsertDisasterEventGeom =
	typeof disasterEventGeomTable.$inferInsert;
