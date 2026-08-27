import { sql } from "drizzle-orm";
import {
	AnyPgColumn,
	check,
	index,
	pgEnum,
	pgTable,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { disasterEventTable } from "./disasterEventTable";
import { hazardousEventTable } from "./hazardousEventTable";

export const eventCausalityEntityTypeEnum = pgEnum(
	"event_causality_entity_type",
	["HE", "DE"],
);

export const eventCausalityTable = pgTable(
	"event_causality",
	{
		id: uuid("id")
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		triggeringEntityType: eventCausalityEntityTypeEnum(
			"triggering_entity_type",
		).notNull(),
		triggeringHazardousEventId: uuid("triggering_hazardous_event_id").references(
			(): AnyPgColumn => hazardousEventTable.id,
			{
				onDelete: "cascade",
			},
		),
		triggeringDisasterEventId: uuid("triggering_disaster_event_id").references(
			(): AnyPgColumn => disasterEventTable.id,
			{
				onDelete: "cascade",
			},
		),
		triggeredEntityType: eventCausalityEntityTypeEnum(
			"triggered_entity_type",
		).notNull(),
		triggeredHazardousEventId: uuid("triggered_hazardous_event_id").references(
			(): AnyPgColumn => hazardousEventTable.id,
			{
				onDelete: "cascade",
			},
		),
		triggeredDisasterEventId: uuid("triggered_disaster_event_id").references(
			(): AnyPgColumn => disasterEventTable.id,
			{
				onDelete: "cascade",
			},
		),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "date",
		})
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", {
			withTimezone: true,
			mode: "date",
		})
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("event_causality_triggering_hazardous_event_id_idx").on(
			table.triggeringHazardousEventId,
		),
		index("event_causality_triggering_disaster_event_id_idx").on(
			table.triggeringDisasterEventId,
		),
		index("event_causality_triggered_hazardous_event_id_idx").on(
			table.triggeredHazardousEventId,
		),
		index("event_causality_triggered_disaster_event_id_idx").on(
			table.triggeredDisasterEventId,
		),
		check(
			"event_causality_triggering_entity_fk_check",
			sql`(
				(triggering_entity_type = 'HE' AND triggering_hazardous_event_id IS NOT NULL AND triggering_disaster_event_id IS NULL)
				OR
				(triggering_entity_type = 'DE' AND triggering_disaster_event_id IS NOT NULL AND triggering_hazardous_event_id IS NULL)
			)`,
		),
		check(
			"event_causality_triggered_entity_fk_check",
			sql`(
				(triggered_entity_type = 'HE' AND triggered_hazardous_event_id IS NOT NULL AND triggered_disaster_event_id IS NULL)
				OR
				(triggered_entity_type = 'DE' AND triggered_disaster_event_id IS NOT NULL AND triggered_hazardous_event_id IS NULL)
			)`,
		),
	],
);

export type SelectEventCausality = typeof eventCausalityTable.$inferSelect;
export type InsertEventCausality = typeof eventCausalityTable.$inferInsert;