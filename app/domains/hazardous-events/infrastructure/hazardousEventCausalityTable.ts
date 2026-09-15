import { sql } from "drizzle-orm";
import {
	pgTable,
	uuid,
	text,
	timestamp,
	index,
	check,
} from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";

export const hazardousEventCausalityTable = pgTable(
	"hazardous_event_causality",
	{
		id: ourRandomUUID(),
		causeHazardousEventId: uuid("cause_hazardous_event_id")
			.notNull()
			.references(() => hazardousEventTable.id, { onDelete: "cascade" }),
		effectHazardousEventId: uuid("effect_hazardous_event_id")
			.notNull()
			.references(() => hazardousEventTable.id, { onDelete: "cascade" }),
		causalityExplanation: text("causality_explanation"),
		// inline withTimezone (not createdUpdatedTimestamps) per ADR-002
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => [
		index("hazardous_event_causality_cause_id_idx").on(
			table.causeHazardousEventId,
		),
		index("hazardous_event_causality_effect_id_idx").on(
			table.effectHazardousEventId,
		),
		// DB-level trivial-case (1-length) guard only; n-length cycle detection stays app-layer (3c)
		check(
			"hazardous_event_causality_cause_effect_distinct_check",
			sql`cause_hazardous_event_id <> effect_hazardous_event_id`,
		),
	],
);

export type SelectHazardousEventCausality =
	typeof hazardousEventCausalityTable.$inferSelect;
export type InsertHazardousEventCausality =
	typeof hazardousEventCausalityTable.$inferInsert;
