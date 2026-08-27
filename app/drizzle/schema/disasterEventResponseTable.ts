import {
	AnyPgColumn,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { ourRandomUUID } from "../../utils/drizzleUtil";
import { disasterEventTable } from "./disasterEventTable";
import { responseTypeTable } from "./responseTypeTable";

export const disasterEventResponseTable = pgTable(
	"disaster_event_response",
	{
		id: ourRandomUUID(),
		disasterEventId: uuid("disaster_event_id").references(
			(): AnyPgColumn => disasterEventTable.id,
			{ onDelete: "cascade" },
		),
		responseTypeId: uuid("response_type_id")
			.notNull()
			.references((): AnyPgColumn => responseTypeTable.id),
		responseDate: timestamp("response_date", { withTimezone: true }),
		coverage: text("coverage"),
		description: text("description"),
	},
	(table) => [
		index("disaster_event_response_disaster_event_id_idx").on(
			table.disasterEventId,
		),
		index("disaster_event_response_response_type_id_idx").on(
			table.responseTypeId,
		),
	],
);

export type SelectDisasterEventResponse =
	typeof disasterEventResponseTable.$inferSelect;
export type InsertDisasterEventResponse =
	typeof disasterEventResponseTable.$inferInsert;
