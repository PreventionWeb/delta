import { relations } from "drizzle-orm";
import { pgTable, uuid, AnyPgColumn, unique } from "drizzle-orm/pg-core";
import { damagesTable } from "./damagesTable";
import { divisionTable } from "./divisionTable";
import { ourRandomUUID } from "../../utils/drizzleUtil";

export const damagesDivisionTable = pgTable(
	"damages_division",
	{
		id: ourRandomUUID(),
		damageId: uuid("damage_id")
			.notNull()
			.references((): AnyPgColumn => damagesTable.id, {
				onDelete: "cascade",
			}),
		divisionId: uuid("division_id")
			.notNull()
			.references((): AnyPgColumn => divisionTable.id),
	},
	(table) => [
		unique("damages_division_damage_id_division_id").on(
			table.damageId,
			table.divisionId,
		),
	],
);

export const damagesDivisionRel = relations(
	damagesDivisionTable,
	({ one }) => ({
		damage: one(damagesTable, {
			fields: [damagesDivisionTable.damageId],
			references: [damagesTable.id],
		}),
		division: one(divisionTable, {
			fields: [damagesDivisionTable.divisionId],
			references: [divisionTable.id],
		}),
	}),
);

export type SelectDamagesDivision = typeof damagesDivisionTable.$inferSelect;
export type InsertDamagesDivision = typeof damagesDivisionTable.$inferInsert;
