import {
	AnyPgColumn,
	bigint,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { disasterEventDeclarationTable } from "./disasterEventDeclarationTable";

export const disasterEventDeclarationAttachmentTable = pgTable(
	"disaster_event_declaration_attachment",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		disasterEventDeclarationId: uuid("disaster_event_declaration_id")
			.notNull()
			.references((): AnyPgColumn => disasterEventDeclarationTable.id, {
				onDelete: "cascade",
			}),
		title: text("title").notNull(),
		fileKey: text("file_key").notNull(),
		fileName: text("file_name").notNull(),
		fileType: text("file_type").notNull(),
		fileSize: bigint("file_size", { mode: "number" }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("dis_event_decl_attachment_declaration_id_idx").on(
			table.disasterEventDeclarationId,
		),
	],
);

export type SelectDisasterEventDeclarationAttachment =
	typeof disasterEventDeclarationAttachmentTable.$inferSelect;
export type InsertDisasterEventDeclarationAttachment =
	typeof disasterEventDeclarationAttachmentTable.$inferInsert;
