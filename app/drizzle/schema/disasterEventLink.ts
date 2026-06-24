import {
	AnyPgColumn,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { disasterEventTable } from "./disasterEventTable";
import { sql } from "drizzle-orm";

export const disasterEventLinkTable = pgTable("disaster_event_link", {
	id: uuid("id")
		.primaryKey()
		.default(sql`gen_random_uuid()`),
	disasterEventId: uuid("disaster_event_id").references(
		(): AnyPgColumn => disasterEventTable.id,
		{
			onDelete: "cascade",
		},
	),
	title: text("title"),
	url: text("url").notNull(),
	createdAt: timestamp("created_at", {
		withTimezone: true,
		mode: "date",
	})
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", {
		withTimezone: true,
		mode: "date",
	}),
});

export type SelectDisasterEventLink =
	typeof disasterEventLinkTable.$inferSelect;
export type InsertDisasterEventLink =
	typeof disasterEventLinkTable.$inferInsert;
