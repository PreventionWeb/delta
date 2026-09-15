import { sql } from "drizzle-orm";
import {
	check,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { userTable } from "~/drizzle/schema/userTable";
import { ourRandomUUID } from "~/utils/drizzleUtil";

// Shared with workflowHistoryTable.ts — single source of truth for the status domain.
export const STATUS_VALUES = [
	"DRAFT",
	"SUBMITTED",
	"REVISION_REQUESTED",
	"APPROVED",
	"REJECTED",
	"PUBLISHED",
] as const;

export const ENTITY_TYPE_VALUES = ["HE", "DE", "DR"] as const;

// Builds a CHECK constraint's IN (...) list from a const array so it can't drift from the enum.
export function sqlValueList(values: readonly string[]) {
	return sql.raw(values.map((v) => `'${v}'`).join(", "));
}

export const workflowInstanceTable = pgTable(
	"workflow_instance",
	{
		id: ourRandomUUID(),
		// Polymorphic key, no single FK possible across 3 tables (design.md Decision 1).
		entityId: uuid("entity_id").notNull(),
		entityType: text("entity_type", { enum: ENTITY_TYPE_VALUES }).notNull(),
		status: text("status", { enum: STATUS_VALUES }).notNull().default("DRAFT"),
		// Symmetric per-transition attribution, deliberate addition beyond the diagram (design.md Decision 10).
		submittedByUserId: uuid("submitted_by_user_id").references(
			() => userTable.id,
		),
		submittedAt: timestamp("submitted_at", { withTimezone: true }),
		validatedByUserId: uuid("validated_by_user_id").references(
			() => userTable.id,
		),
		validatedAt: timestamp("validated_at", { withTimezone: true }),
		approvedByUserId: uuid("approved_by_user_id").references(
			() => userTable.id,
		),
		approvedAt: timestamp("approved_at", { withTimezone: true }),
		publishedByUserId: uuid("published_by_user_id").references(
			() => userTable.id,
		),
		publishedAt: timestamp("published_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		// No countryAccountsId — caller's own repository validates tenant ownership (design.md Decision 2).
	},
	(table) => [
		check(
			"workflow_instance_entity_type_check",
			sql`entity_type IN (${sqlValueList(ENTITY_TYPE_VALUES)})`,
		),
		check(
			"workflow_instance_status_check",
			sql`status IN (${sqlValueList(STATUS_VALUES)})`,
		),
		// One instance per entity (design.md Decision 4).
		uniqueIndex("workflow_instance_entity_id_entity_type_unique").on(
			table.entityId,
			table.entityType,
		),
	],
);

export type SelectWorkflowInstance = typeof workflowInstanceTable.$inferSelect;
export type InsertWorkflowInstance = typeof workflowInstanceTable.$inferInsert;
