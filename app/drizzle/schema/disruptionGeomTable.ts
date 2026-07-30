import { relations } from "drizzle-orm";
import {
	pgTable,
	uuid,
	AnyPgColumn,
	text,
	customType,
} from "drizzle-orm/pg-core";
import { disruptionTable } from "./disruptionTable";
import { ourRandomUUID } from "../../utils/drizzleUtil";

const geometryType = customType<{ data: unknown }>({
	dataType: () => "geometry(Geometry,4326)",
});

export const disruptionGeomTable = pgTable("disruption_geom", {
	id: ourRandomUUID(),
	disruptionId: uuid("disruption_id")
		.notNull()
		.references((): AnyPgColumn => disruptionTable.id, {
			onDelete: "cascade",
		}),
	geom: geometryType("geom").notNull().$type<unknown>(),
	title: text("title"),
});

export const disruptionGeomRel = relations(disruptionGeomTable, ({ one }) => ({
	disruption: one(disruptionTable, {
		fields: [disruptionGeomTable.disruptionId],
		references: [disruptionTable.id],
	}),
}));

export type SelectDisruptionGeom = typeof disruptionGeomTable.$inferSelect;
export type InsertDisruptionGeom = typeof disruptionGeomTable.$inferInsert;
