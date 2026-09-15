import { sql } from "drizzle-orm";
import {
	pgTable,
	text,
	uuid,
	boolean,
	timestamp,
	index,
	unique,
} from "drizzle-orm/pg-core";
import { ourRandomUUID } from "~/utils/drizzleUtil";
import { countryAccountsTable } from "~/drizzle/schema/countryAccountsTable";
import { hazardTypeTable } from "./hazardTypeTable";
import { fieldDataTypeTable } from "./fieldDataTypeTable";
import { fieldUnitTable } from "./fieldUnitTable";

export const hazardTypeCustomFieldDefinitionTable = pgTable(
	"hazard_type_custom_field_definition",
	{
		id: ourRandomUUID(),
		countryAccountsId: uuid("country_accounts_id")
			.notNull()
			.references(() => countryAccountsTable.id, { onDelete: "cascade" }),
		// Diagram's stale "hip_type_id" label corrected — targets hazardTypeTable (design.md Decision 1).
		hazardTypeId: uuid("hazard_type_id")
			.notNull()
			.references(() => hazardTypeTable.id),
		fieldKey: text("field_key").notNull(),
		label: text("label").notNull(),
		dataType: uuid("data_type")
			.notNull()
			.references(() => fieldDataTypeTable.id),
		required: boolean("required").notNull(),
		// Genuine FK despite the diagram's "NN" badge, confirmed via edge-connector check (design.md Decision 1).
		unit: uuid("unit")
			.notNull()
			.references(() => fieldUnitTable.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => [
		index("hazard_type_custom_field_definition_hazard_type_id_idx").on(
			table.hazardTypeId,
		),
		index("hazard_type_custom_field_definition_data_type_idx").on(
			table.dataType,
		),
		index("hazard_type_custom_field_definition_unit_idx").on(table.unit),
		index("hazard_type_custom_field_definition_country_accounts_id_idx").on(
			table.countryAccountsId,
		),
		// Shortened from the 87-byte unabbreviated form — over Postgres's 63-byte limit (design.md Decision 7).
		unique("hazard_type_custom_field_definition_ca_ht_key_unique").on(
			table.countryAccountsId,
			table.hazardTypeId,
			table.fieldKey,
		),
	],
);

export type SelectHazardTypeCustomFieldDefinition =
	typeof hazardTypeCustomFieldDefinitionTable.$inferSelect;
export type InsertHazardTypeCustomFieldDefinition =
	typeof hazardTypeCustomFieldDefinitionTable.$inferInsert;
