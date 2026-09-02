import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { userTable } from "~/drizzle/schema/userTable";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { workflowInstanceTable } from "./workflowInstanceTable";

export const workflowNotificationTable = pgTable("workflow_notification", {
	id: ourRandomUUID(),
	instanceId: uuid("instance_id")
		.notNull()
		.references(() => workflowInstanceTable.id, { onDelete: "cascade" }),
	notifiedUserId: uuid("notified_user_id")
		.notNull()
		.references(() => userTable.id),
	// Nullable — a system-initiated notification may have no human trigger.
	notifiedByUserId: uuid("notified_by_user_id").references(() => userTable.id),
	// No DB default despite the diagram's "default now()" — would break the tested pending-delivery scenario (design.md Decision 11).
	notifiedAt: timestamp("notified_at", { withTimezone: true }),
	notificationMessage: text("notification_message"),
	// Unconstrained — delivery mechanism is Phase 4a's INotificationPort concern (design.md Decision 11).
	channel: text("channel"),
});

export type SelectWorkflowNotification =
	typeof workflowNotificationTable.$inferSelect;
export type InsertWorkflowNotification =
	typeof workflowNotificationTable.$inferInsert;
