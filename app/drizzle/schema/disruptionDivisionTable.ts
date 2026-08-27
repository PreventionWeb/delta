import { relations } from "drizzle-orm";
import { pgTable, uuid, AnyPgColumn, unique } from "drizzle-orm/pg-core";
import { disruptionTable } from "./disruptionTable";
import { divisionTable } from "./divisionTable";
import { ourRandomUUID } from "../../utils/drizzleUtil";

export const disruptionDivisionTable = pgTable(
	"disruption_division",
	{
		id: ourRandomUUID(),
		disruptionId: uuid("disruption_id")
			.notNull()
			.references((): AnyPgColumn => disruptionTable.id, {
				onDelete: "cascade",
			}),
		divisionId: uuid("division_id")
			.notNull()
			.references((): AnyPgColumn => divisionTable.id),
	},
	(table) => [
		unique("disruption_division_disruption_id_division_id").on(
			table.disruptionId,
			table.divisionId,
		),
	],
);

export const disruptionDivisionRel = relations(
	disruptionDivisionTable,
	({ one }) => ({
		disruption: one(disruptionTable, {
			fields: [disruptionDivisionTable.disruptionId],
			references: [disruptionTable.id],
		}),
		division: one(divisionTable, {
			fields: [disruptionDivisionTable.divisionId],
			references: [divisionTable.id],
		}),
	}),
);

export type SelectDisruptionDivision =
	typeof disruptionDivisionTable.$inferSelect;
export type InsertDisruptionDivision =
	typeof disruptionDivisionTable.$inferInsert;
