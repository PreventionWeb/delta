import {
	pgTable,
	uuid,
	text,
	bigint,
	timestamp,
	AnyPgColumn,
} from "drizzle-orm/pg-core";
import { disasterEventTable } from "./disasterEventTable";

export const disasterEventAttachmentTable = pgTable(
	"disaster_event_attachment",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		disasterEventId: uuid("disaster_event_id").references(
			(): AnyPgColumn => disasterEventTable.id,
			{
				onDelete: "cascade",
			},
		),
		fileKey: text("file_key").notNull().default(""),
		fileName: text("file_name").notNull().default(""),
		fileType: text("file_type").notNull().default(""),
		fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
		createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
	},
);

export type SelectDisasterEventAttachment =
	typeof disasterEventAttachmentTable.$inferSelect;
export type InsertDisasterEventAttachment =
	typeof disasterEventAttachmentTable.$inferInsert;
