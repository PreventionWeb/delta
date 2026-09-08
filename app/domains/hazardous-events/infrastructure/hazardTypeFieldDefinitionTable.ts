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
import { hazardTypeTable } from "./hazardTypeTable";
import { fieldDataTypeTable } from "./fieldDataTypeTable";
import { fieldUnitTable } from "./fieldUnitTable";

export const hazardTypeFieldDefinitionTable = pgTable(
	"hazard_type_field_definition",
	{
		id: ourRandomUUID(),
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
		index("hazard_type_field_definition_hazard_type_id_idx").on(
			table.hazardTypeId,
		),
		index("hazard_type_field_definition_data_type_idx").on(table.dataType),
		index("hazard_type_field_definition_unit_idx").on(table.unit),
		unique("hazard_type_field_definition_hazard_type_id_field_key_unique").on(
			table.hazardTypeId,
			table.fieldKey,
		),
	],
);

export type SelectHazardTypeFieldDefinition =
	typeof hazardTypeFieldDefinitionTable.$inferSelect;
export type InsertHazardTypeFieldDefinition =
	typeof hazardTypeFieldDefinitionTable.$inferInsert;
