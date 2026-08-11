import {
	AnyPgColumn,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { ourRandomUUID } from "../../utils/drizzleUtil";
import { declarationStatusTable } from "./declarationStatusTable";
import { disasterEventTable } from "./disasterEventTable";

export const disasterEventDeclarationTable = pgTable(
	"disaster_event_declaration",
	{
		id: ourRandomUUID(),
		disasterEventId: uuid("disaster_event_id")
			.notNull()
			.references((): AnyPgColumn => disasterEventTable.id, {
				onDelete: "cascade",
			}),
		type: text("type"),
		effects: text("effects"),
		declarationDate: timestamp("declaration_date", { withTimezone: true }),
		issuingOrganization: text("issuing_organization"),
		coverage: text("coverage"),
		declarationStatusId: uuid("declaration_status_id").references(
			(): AnyPgColumn => declarationStatusTable.id,
		),
	},
	(table) => [
		index("dis_event_declaration_event_id_idx").on(table.disasterEventId),
		index("dis_event_declaration_status_id_idx").on(table.declarationStatusId),
	],
);

export type SelectDisasterEventDeclaration =
	typeof disasterEventDeclarationTable.$inferSelect;
export type InsertDisasterEventDeclaration =
	typeof disasterEventDeclarationTable.$inferInsert;
