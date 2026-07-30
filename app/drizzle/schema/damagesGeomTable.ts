import { relations } from "drizzle-orm";
import {
	pgTable,
	uuid,
	AnyPgColumn,
	text,
	customType,
} from "drizzle-orm/pg-core";
import { damagesTable } from "./damagesTable";
import { ourRandomUUID } from "../../utils/drizzleUtil";

const geometryType = customType<{ data: unknown }>({
	dataType: () => "geometry(Geometry,4326)",
});

export const damagesGeomTable = pgTable("damages_geom", {
	id: ourRandomUUID(),
	damageId: uuid("damage_id")
		.notNull()
		.references((): AnyPgColumn => damagesTable.id, {
			onDelete: "cascade",
		}),
	geom: geometryType("geom").notNull().$type<unknown>(),
	title: text("title"),
});

export const damagesGeomRel = relations(damagesGeomTable, ({ one }) => ({
	damage: one(damagesTable, {
		fields: [damagesGeomTable.damageId],
		references: [damagesTable.id],
	}),
}));

export type SelectDamagesGeom = typeof damagesGeomTable.$inferSelect;
export type InsertDamagesGeom = typeof damagesGeomTable.$inferInsert;
