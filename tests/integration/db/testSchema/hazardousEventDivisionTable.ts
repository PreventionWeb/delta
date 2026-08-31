import { relations } from "drizzle-orm";
import { pgTable, uuid, AnyPgColumn, unique } from "drizzle-orm/pg-core";
import { hazardousEventTable } from "./hazardousEventTable";
import { divisionTable } from "./divisionTable";
import { ourRandomUUID } from "~/utils/drizzleUtil";

export const hazardousEventDivisionTable = pgTable(
	"hazardous_event_division",
	{
		id: ourRandomUUID(),
		hazardousEventId: uuid("hazardous_event_id")
			.notNull()
			.references((): AnyPgColumn => hazardousEventTable.id, {
				onDelete: "cascade",
			}),
		divisionId: uuid("division_id")
			.notNull()
			.references((): AnyPgColumn => divisionTable.id),
	},
	(table) => [
		unique("hazardous_event_division_hazardous_event_id_division_id").on(
			table.hazardousEventId,
			table.divisionId,
		),
	],
);

export const hazardousEventDivisionRel = relations(
	hazardousEventDivisionTable,
	({ one }) => ({
		hazardousEvent: one(hazardousEventTable, {
			fields: [hazardousEventDivisionTable.hazardousEventId],
			references: [hazardousEventTable.id],
		}),
		division: one(divisionTable, {
			fields: [hazardousEventDivisionTable.divisionId],
			references: [divisionTable.id],
		}),
	}),
);

export type SelectHazardousEventDivision =
	typeof hazardousEventDivisionTable.$inferSelect;
export type InsertHazardousEventDivision =
	typeof hazardousEventDivisionTable.$inferInsert;
