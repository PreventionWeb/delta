import { sql } from "drizzle-orm";
import {
	AnyPgColumn,
	bigint,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { ourRandomUUID } from "../../utils/drizzleUtil";
import { disasterEventAssessmentTable } from "./disasterEventAssessmentTable";

export const disasterEventAssessmentAttachmentTable = pgTable(
	"disaster_event_assessment_attachment",
	{
		id: ourRandomUUID(),
		disasterEventAssessmentId: uuid("disaster_event_assessment_id")
			.notNull()
			.references((): AnyPgColumn => disasterEventAssessmentTable.id, {
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
		index("dis_event_assessment_attachment_assessment_id_idx").on(
			table.disasterEventAssessmentId,
		),
	],
);

export type SelectDisasterEventAssessmentAttachment =
	typeof disasterEventAssessmentAttachmentTable.$inferSelect;
export type InsertDisasterEventAssessmentAttachment =
	typeof disasterEventAssessmentAttachmentTable.$inferInsert;
