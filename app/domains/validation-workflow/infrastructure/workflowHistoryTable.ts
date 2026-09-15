import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { userTable } from "~/drizzle/schema/userTable";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import {
	STATUS_VALUES,
	sqlValueList,
	workflowInstanceTable,
} from "./workflowInstanceTable";

export const workflowHistoryTable = pgTable(
	"workflow_history",
	{
		id: ourRandomUUID(),
		instanceId: uuid("instance_id")
			.notNull()
			.references(() => workflowInstanceTable.id, { onDelete: "cascade" }),
		// Nullable: the initial DRAFT row has no prior status.
		fromStatus: text("from_status", { enum: STATUS_VALUES }),
		toStatus: text("to_status", { enum: STATUS_VALUES }).notNull(),
		// Not null: every transition today has a real user, no automated ones yet (design.md Decision 8).
		actingUserId: uuid("acting_user_id")
			.notNull()
			.references(() => userTable.id),
		// Not "timestamp" — would shadow this file's own timestamp() import (design.md Decision 7).
		occurredAt: timestamp("occurred_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		// Optional note on the transition, e.g. a rejection reason.
		comment: text("comment"),
	},
	() => [
		check(
			"workflow_history_to_status_check",
			sql`to_status IN (${sqlValueList(STATUS_VALUES)})`,
		),
		check(
			"workflow_history_from_status_check",
			sql`from_status IS NULL OR from_status IN (${sqlValueList(STATUS_VALUES)})`,
		),
	],
);

export type SelectWorkflowHistory = typeof workflowHistoryTable.$inferSelect;
export type InsertWorkflowHistory = typeof workflowHistoryTable.$inferInsert;
