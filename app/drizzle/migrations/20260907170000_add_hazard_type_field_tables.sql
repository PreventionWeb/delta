CREATE TABLE IF NOT EXISTS "field_data_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	CONSTRAINT "field_data_type_type_unique" UNIQUE ("type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "field_unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit" text NOT NULL,
	CONSTRAINT "field_unit_unit_unique" UNIQUE ("unit")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hazard_type_field_definition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hazard_type_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"data_type" uuid NOT NULL,
	"required" boolean NOT NULL,
	"unit" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "hazard_type_field_definition_hazard_type_id_fk" FOREIGN KEY ("hazard_type_id")
		REFERENCES "hazard_type"("id"),
	CONSTRAINT "hazard_type_field_definition_data_type_fk" FOREIGN KEY ("data_type")
		REFERENCES "field_data_type"("id"),
	CONSTRAINT "hazard_type_field_definition_unit_fk" FOREIGN KEY ("unit")
		REFERENCES "field_unit"("id"),
	CONSTRAINT "hazard_type_field_definition_hazard_type_id_field_key_unique" UNIQUE ("hazard_type_id", "field_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hazard_type_custom_field_definition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_accounts_id" uuid NOT NULL,
	"hazard_type_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"data_type" uuid NOT NULL,
	"required" boolean NOT NULL,
	"unit" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "hazard_type_custom_field_definition_country_accounts_id_fk" FOREIGN KEY ("country_accounts_id")
		REFERENCES "country_accounts"("id")
		ON DELETE CASCADE,
	CONSTRAINT "hazard_type_custom_field_definition_hazard_type_id_fk" FOREIGN KEY ("hazard_type_id")
		REFERENCES "hazard_type"("id"),
	CONSTRAINT "hazard_type_custom_field_definition_data_type_fk" FOREIGN KEY ("data_type")
		REFERENCES "field_data_type"("id"),
	CONSTRAINT "hazard_type_custom_field_definition_unit_fk" FOREIGN KEY ("unit")
		REFERENCES "field_unit"("id"),
	CONSTRAINT "hazard_type_custom_field_definition_ca_ht_key_unique" UNIQUE ("country_accounts_id", "hazard_type_id", "field_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hazardous_event_field_value" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hazardous_event_id" uuid NOT NULL,
	"hazard_type_field_definition_id" uuid NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "hazardous_event_field_value_hazardous_event_id_fk" FOREIGN KEY ("hazardous_event_id")
		REFERENCES "hazardous_event"("id")
		ON DELETE CASCADE,
	CONSTRAINT "hazardous_event_field_value_field_def_id_fk" FOREIGN KEY ("hazard_type_field_definition_id")
		REFERENCES "hazard_type_field_definition"("id")
		ON DELETE CASCADE,
	CONSTRAINT "hazardous_event_field_value_event_id_field_def_id_unique" UNIQUE ("hazardous_event_id", "hazard_type_field_definition_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hazardous_event_custom_field_value" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hazardous_event_id" uuid NOT NULL,
	"hazard_type_custom_field_definition_id" uuid NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "hazardous_event_custom_field_value_hazardous_event_id_fk" FOREIGN KEY ("hazardous_event_id")
		REFERENCES "hazardous_event"("id")
		ON DELETE CASCADE,
	CONSTRAINT "hazardous_event_custom_field_value_custom_field_def_id_fk" FOREIGN KEY ("hazard_type_custom_field_definition_id")
		REFERENCES "hazard_type_custom_field_definition"("id")
		ON DELETE CASCADE,
	CONSTRAINT "hazardous_event_custom_field_value_evt_id_def_id_unique" UNIQUE ("hazardous_event_id", "hazard_type_custom_field_definition_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazard_type_field_definition_hazard_type_id_idx"
	ON "hazard_type_field_definition" ("hazard_type_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazard_type_field_definition_data_type_idx"
	ON "hazard_type_field_definition" ("data_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazard_type_field_definition_unit_idx"
	ON "hazard_type_field_definition" ("unit");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazard_type_custom_field_definition_hazard_type_id_idx"
	ON "hazard_type_custom_field_definition" ("hazard_type_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazard_type_custom_field_definition_data_type_idx"
	ON "hazard_type_custom_field_definition" ("data_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazard_type_custom_field_definition_unit_idx"
	ON "hazard_type_custom_field_definition" ("unit");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazard_type_custom_field_definition_country_accounts_id_idx"
	ON "hazard_type_custom_field_definition" ("country_accounts_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazardous_event_field_value_hazardous_event_id_idx"
	ON "hazardous_event_field_value" ("hazardous_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazardous_event_field_value_field_def_id_idx"
	ON "hazardous_event_field_value" ("hazard_type_field_definition_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazardous_event_custom_field_value_hazardous_event_id_idx"
	ON "hazardous_event_custom_field_value" ("hazardous_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazardous_event_custom_field_value_custom_field_def_id_idx"
	ON "hazardous_event_custom_field_value" ("hazard_type_custom_field_definition_id");
