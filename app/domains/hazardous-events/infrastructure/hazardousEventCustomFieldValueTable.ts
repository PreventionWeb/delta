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
import { hazardTypeCustomFieldDefinitionTable } from "./hazardTypeCustomFieldDefinitionTable";

export const hazardousEventCustomFieldValueTable = pgTable(
	"hazardous_event_custom_field_value",
	{
		id: ourRandomUUID(),
		hazardousEventId: uuid("hazardous_event_id")
			.notNull()
			.references(() => hazardousEventTable.id, { onDelete: "cascade" }),
		// FK/index/unique abbreviated — unabbreviated form is 99 bytes, over the 63-byte limit (design.md Decision 7).
		hazardTypeCustomFieldDefinitionId: uuid(
			"hazard_type_custom_field_definition_id",
		)
			.notNull()
			.references(() => hazardTypeCustomFieldDefinitionTable.id, {
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
		index("hazardous_event_custom_field_value_hazardous_event_id_idx").on(
			table.hazardousEventId,
		),
		index("hazardous_event_custom_field_value_custom_field_def_id_idx").on(
			table.hazardTypeCustomFieldDefinitionId,
		),
		unique("hazardous_event_custom_field_value_evt_id_def_id_unique").on(
			table.hazardousEventId,
			table.hazardTypeCustomFieldDefinitionId,
		),
	],
);

export type SelectHazardousEventCustomFieldValue =
	typeof hazardousEventCustomFieldValueTable.$inferSelect;
export type InsertHazardousEventCustomFieldValue =
	typeof hazardousEventCustomFieldValueTable.$inferInsert;
