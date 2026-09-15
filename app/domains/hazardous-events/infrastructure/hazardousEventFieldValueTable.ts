import { sql } from "drizzle-orm";
import {
	pgTable,
	text,
	uuid,
	timestamp,
	index,
	unique,
} from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { hazardTypeFieldDefinitionTable } from "./hazardTypeFieldDefinitionTable";

export const hazardousEventFieldValueTable = pgTable(
	"hazardous_event_field_value",
	{
		id: ourRandomUUID(),
		hazardousEventId: uuid("hazardous_event_id")
			.notNull()
			.references(() => hazardousEventTable.id, { onDelete: "cascade" }),
		// FK/index/unique names abbreviated to field_def_id — full form exceeds 63 bytes (design.md Decision 7).
		hazardTypeFieldDefinitionId: uuid("hazard_type_field_definition_id")
			.notNull()
			.references(() => hazardTypeFieldDefinitionTable.id, {
				onDelete: "cascade",
			}),
		value: text("value").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => [
		index("hazardous_event_field_value_hazardous_event_id_idx").on(
			table.hazardousEventId,
		),
		index("hazardous_event_field_value_field_def_id_idx").on(
			table.hazardTypeFieldDefinitionId,
		),
		unique("hazardous_event_field_value_event_id_field_def_id_unique").on(
			table.hazardousEventId,
			table.hazardTypeFieldDefinitionId,
		),
	],
);

export type SelectHazardousEventFieldValue =
	typeof hazardousEventFieldValueTable.$inferSelect;
export type InsertHazardousEventFieldValue =
	typeof hazardousEventFieldValueTable.$inferInsert;
