import { relations } from "drizzle-orm";
import {
	pgTable,
	uuid,
	AnyPgColumn,
	text,
	customType,
} from "drizzle-orm/pg-core";
import { disasterRecordsTable } from "./disasterRecordsTable";
import { ourRandomUUID } from "../../utils/drizzleUtil";

const geometryType = customType<{ data: unknown }>({
	dataType: () => "geometry(Geometry,4326)",
});

export const disasterRecordsGeomTable = pgTable("disaster_records_geom", {
	id: ourRandomUUID(),
	disasterRecordId: uuid("disaster_record_id")
		.notNull()
		.references((): AnyPgColumn => disasterRecordsTable.id, {
			onDelete: "cascade",
		}),
	geom: geometryType("geom").notNull().$type<unknown>(),
	title: text("title"),
});

export const disasterRecordsGeomRel = relations(
	disasterRecordsGeomTable,
	({ one }) => ({
		disasterRecord: one(disasterRecordsTable, {
			fields: [disasterRecordsGeomTable.disasterRecordId],
			references: [disasterRecordsTable.id],
		}),
	}),
);

export type SelectDisasterRecordsGeom =
	typeof disasterRecordsGeomTable.$inferSelect;
export type InsertDisasterRecordsGeom =
	typeof disasterRecordsGeomTable.$inferInsert;
