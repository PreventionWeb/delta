import { relations } from "drizzle-orm";
import { pgTable, uuid, AnyPgColumn, unique } from "drizzle-orm/pg-core";
import { disasterRecordsTable } from "./disasterRecordsTable";
import { divisionTable } from "./divisionTable";
import { ourRandomUUID } from "../../utils/drizzleUtil";

export const disasterRecordsDivisionTable = pgTable(
	"disaster_records_division",
	{
		id: ourRandomUUID(),
		disasterRecordId: uuid("disaster_record_id")
			.notNull()
			.references((): AnyPgColumn => disasterRecordsTable.id, {
				onDelete: "cascade",
			}),
		divisionId: uuid("division_id")
			.notNull()
			.references((): AnyPgColumn => divisionTable.id),
	},
	(table) => [
		unique("disaster_records_division_disaster_record_id_division_id").on(
			table.disasterRecordId,
			table.divisionId,
		),
	],
);

export const disasterRecordsDivisionRel = relations(
	disasterRecordsDivisionTable,
	({ one }) => ({
		disasterRecord: one(disasterRecordsTable, {
			fields: [disasterRecordsDivisionTable.disasterRecordId],
			references: [disasterRecordsTable.id],
		}),
		division: one(divisionTable, {
			fields: [disasterRecordsDivisionTable.divisionId],
			references: [divisionTable.id],
		}),
	}),
);

export type SelectDisasterRecordsDivision =
	typeof disasterRecordsDivisionTable.$inferSelect;
export type InsertDisasterRecordsDivision =
	typeof disasterRecordsDivisionTable.$inferInsert;
