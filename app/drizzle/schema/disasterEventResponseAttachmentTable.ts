import {
	AnyPgColumn,
	bigint,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ourRandomUUID } from "../../utils/drizzleUtil";
import { disasterEventResponseTable } from "./disasterEventResponseTable";

export const disasterEventResponseAttachmentTable = pgTable(
	"disaster_event_response_attachment",
	{
		id: ourRandomUUID(),
		disasterEventResponseId: uuid("disaster_event_response_id")
			.notNull()
			.references((): AnyPgColumn => disasterEventResponseTable.id, {
				onDelete: "cascade",
			}),
		title: text("title").notNull(),
		fileKey: text("file_key").notNull(),
		fileName: text("file_name").notNull(),
		fileType: text("file_type").notNull(),
		fileSize: bigint("file_size", { mode: "number" }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("dis_event_resp_attachment_response_id_idx").on(
			table.disasterEventResponseId,
		),
	],
);

export type SelectDisasterEventResponseAttachment =
	typeof disasterEventResponseAttachmentTable.$inferSelect;
export type InsertDisasterEventResponseAttachment =
	typeof disasterEventResponseAttachmentTable.$inferInsert;
