import { sql } from "drizzle-orm";
import {
	pgTable,
	uuid,
	text,
	bigint,
	jsonb,
	pgEnum,
	timestamp,
	index,
	check,
} from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";

// Matches the AttachmentsFormView/ContentRepeater widget's own `file_option` values exactly
// (ca-shared-attachments-module, proposal.md "What Changes").
export const hazardousEventAttachmentTypeEnum = pgEnum(
	"hazardous_event_attachment_type",
	["File", "Link"],
);

export const hazardousEventAttachmentTable = pgTable(
	"hazardous_event_attachment",
	{
		id: ourRandomUUID(),
		hazardousEventId: uuid("hazardous_event_id")
			.notNull()
			.references(() => hazardousEventTable.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		type: hazardousEventAttachmentTypeEnum("type").notNull(),
		// Link-type only -- null for File-type rows (enforced below).
		url: text("url"),
		// Nullable for both File and Link rows -- not part of the type-matching check. Widget's
		// tokenfield output: an array of {id, name} objects, not a bare string list (design.md
		// Decision 4).
		tag: jsonb("tag").$type<Array<{ id: string; name: string }>>(),
		// File-type only -- null for Link-type rows (enforced below). All four were previously
		// NOT NULL; the widget never produces them for a Link-type item.
		fileKey: text("file_key"),
		fileName: text("file_name"),
		fileType: text("file_type"),
		fileSize: bigint("file_size", { mode: "number" }),
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
		// Mirrors eventCausalityTable's event_causality_triggering_entity_fk_check pattern
		// (spec "Attachment field population matches its type").
		check(
			"hazardous_event_attachment_type_check",
			sql`(
				(${table.type} = 'File' AND ${table.fileKey} IS NOT NULL AND ${table.fileName} IS NOT NULL AND ${table.fileType} IS NOT NULL AND ${table.fileSize} IS NOT NULL AND ${table.url} IS NULL)
				OR
				(${table.type} = 'Link' AND ${table.url} IS NOT NULL AND ${table.fileKey} IS NULL AND ${table.fileName} IS NULL AND ${table.fileType} IS NULL AND ${table.fileSize} IS NULL)
			)`,
		),
	],
);

export type SelectHazardousEventAttachment =
	typeof hazardousEventAttachmentTable.$inferSelect;
export type InsertHazardousEventAttachment =
	typeof hazardousEventAttachmentTable.$inferInsert;
