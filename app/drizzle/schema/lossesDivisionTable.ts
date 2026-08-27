import { relations } from "drizzle-orm";
import { pgTable, uuid, AnyPgColumn, unique } from "drizzle-orm/pg-core";
import { lossesTable } from "./lossesTable";
import { divisionTable } from "./divisionTable";
import { ourRandomUUID } from "../../utils/drizzleUtil";

export const lossesDivisionTable = pgTable(
	"losses_division",
	{
		id: ourRandomUUID(),
		lossId: uuid("loss_id")
			.notNull()
			.references((): AnyPgColumn => lossesTable.id, {
				onDelete: "cascade",
			}),
		divisionId: uuid("division_id")
			.notNull()
			.references((): AnyPgColumn => divisionTable.id),
	},
	(table) => [
		unique("losses_division_loss_id_division_id").on(
			table.lossId,
			table.divisionId,
		),
	],
);

export const lossesDivisionRel = relations(lossesDivisionTable, ({ one }) => ({
	loss: one(lossesTable, {
		fields: [lossesDivisionTable.lossId],
		references: [lossesTable.id],
	}),
	division: one(divisionTable, {
		fields: [lossesDivisionTable.divisionId],
		references: [divisionTable.id],
	}),
}));

export type SelectLossesDivision = typeof lossesDivisionTable.$inferSelect;
export type InsertLossesDivision = typeof lossesDivisionTable.$inferInsert;
