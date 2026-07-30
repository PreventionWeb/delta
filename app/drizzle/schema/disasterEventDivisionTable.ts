import { relations } from "drizzle-orm";
import { pgTable, uuid, AnyPgColumn, unique } from "drizzle-orm/pg-core";
import { disasterEventTable } from "./disasterEventTable";
import { divisionTable } from "./divisionTable";
import { ourRandomUUID } from "../../utils/drizzleUtil";

export const disasterEventDivisionTable = pgTable(
	"disaster_event_division",
	{
		id: ourRandomUUID(),
		disasterEventId: uuid("disaster_event_id")
			.notNull()
			.references((): AnyPgColumn => disasterEventTable.id, {
				onDelete: "cascade",
			}),
		divisionId: uuid("division_id")
			.notNull()
			.references((): AnyPgColumn => divisionTable.id),
	},
	(table) => [
		unique("disaster_event_division_disaster_event_id_division_id").on(
			table.disasterEventId,
			table.divisionId,
		),
	],
);

export const disasterEventDivisionRel = relations(
	disasterEventDivisionTable,
	({ one }) => ({
		disasterEvent: one(disasterEventTable, {
			fields: [disasterEventDivisionTable.disasterEventId],
			references: [disasterEventTable.id],
		}),
		division: one(divisionTable, {
			fields: [disasterEventDivisionTable.divisionId],
			references: [divisionTable.id],
		}),
	}),
);

export type SelectDisasterEventDivision =
	typeof disasterEventDivisionTable.$inferSelect;
export type InsertDisasterEventDivision =
	typeof disasterEventDivisionTable.$inferInsert;
