import { relations } from "drizzle-orm";
import {
	pgTable,
	uuid,
	AnyPgColumn,
	text,
	customType,
} from "drizzle-orm/pg-core";
import { lossesTable } from "./lossesTable";
import { ourRandomUUID } from "../../utils/drizzleUtil";

const geometryType = customType<{ data: unknown }>({
	dataType: () => "geometry(Geometry,4326)",
});

export const lossesGeomTable = pgTable("losses_geom", {
	id: ourRandomUUID(),
	lossId: uuid("loss_id")
		.notNull()
		.references((): AnyPgColumn => lossesTable.id, {
			onDelete: "cascade",
		}),
	geom: geometryType("geom").notNull().$type<unknown>(),
	title: text("title"),
});

export const lossesGeomRel = relations(lossesGeomTable, ({ one }) => ({
	loss: one(lossesTable, {
		fields: [lossesGeomTable.lossId],
		references: [lossesTable.id],
	}),
}));

export type SelectLossesGeom = typeof lossesGeomTable.$inferSelect;
export type InsertLossesGeom = typeof lossesGeomTable.$inferInsert;
