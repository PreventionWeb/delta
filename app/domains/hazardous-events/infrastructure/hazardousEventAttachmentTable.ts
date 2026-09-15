import { sql } from "drizzle-orm";
import {
	pgTable,
	uuid,
	text,
	bigint,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";

export const hazardousEventAttachmentTable = pgTable(
	"hazardous_event_attachment",
	{
		id: ourRandomUUID(),
		hazardousEventId: uuid("hazardous_event_id")
			.notNull()
			.references(() => hazardousEventTable.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		fileKey: text("file_key").notNull(),
		fileName: text("file_name").notNull(),
		fileType: text("file_type").notNull(),
		fileSize: bigint("file_size", { mode: "number" }).notNull(),
		// inline withTimezone (not createdUpdatedTimestamps) per ADR-002
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => [
		index("hazardous_event_attachment_hazardous_event_id_idx").on(
			table.hazardousEventId,
		),
	],
);

export type SelectHazardousEventAttachment =
	typeof hazardousEventAttachmentTable.$inferSelect;
export type InsertHazardousEventAttachment =
	typeof hazardousEventAttachmentTable.$inferInsert;
