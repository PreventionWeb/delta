
----
-- Source: 20260902120000_add_workflow_tables.sql
----

CREATE TABLE IF NOT EXISTS "workflow_instance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp with time zone,
	"validated_by_user_id" uuid,
	"validated_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "workflow_instance_entity_type_check" CHECK (entity_type IN ('HE', 'DE', 'DR')),
	CONSTRAINT "workflow_instance_status_check" CHECK (status IN ('DRAFT', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'PUBLISHED')),
	CONSTRAINT "workflow_instance_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by_user_id")
		REFERENCES "user"("id"),
	CONSTRAINT "workflow_instance_validated_by_user_id_fk" FOREIGN KEY ("validated_by_user_id")
		REFERENCES "user"("id"),
	CONSTRAINT "workflow_instance_approved_by_user_id_fk" FOREIGN KEY ("approved_by_user_id")
		REFERENCES "user"("id"),
	CONSTRAINT "workflow_instance_published_by_user_id_fk" FOREIGN KEY ("published_by_user_id")
		REFERENCES "user"("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_instance_entity_id_entity_type_unique"
	ON "workflow_instance" USING btree ("entity_id", "entity_type");

CREATE TABLE IF NOT EXISTS "workflow_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"acting_user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"comment" text,
	CONSTRAINT "workflow_history_to_status_check" CHECK (to_status IN ('DRAFT', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'PUBLISHED')),
	CONSTRAINT "workflow_history_from_status_check" CHECK (from_status IS NULL OR from_status IN ('DRAFT', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'PUBLISHED')),
	CONSTRAINT "workflow_history_instance_id_fk" FOREIGN KEY ("instance_id")
		REFERENCES "workflow_instance"("id")
		ON DELETE CASCADE,
	CONSTRAINT "workflow_history_acting_user_id_fk" FOREIGN KEY ("acting_user_id")
		REFERENCES "user"("id")
);

CREATE TABLE IF NOT EXISTS "workflow_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"notified_user_id" uuid NOT NULL,
	"notified_by_user_id" uuid,
	"notified_at" timestamp with time zone,
	"notification_message" text,
	"channel" text,
	CONSTRAINT "workflow_notification_instance_id_fk" FOREIGN KEY ("instance_id")
		REFERENCES "workflow_instance"("id")
		ON DELETE CASCADE,
	CONSTRAINT "workflow_notification_notified_user_id_fk" FOREIGN KEY ("notified_user_id")
		REFERENCES "user"("id"),
	CONSTRAINT "workflow_notification_notified_by_user_id_fk" FOREIGN KEY ("notified_by_user_id")
		REFERENCES "user"("id")
);


----
-- Source: 20260904120000_add_hip_hierarchy_tables.sql
----

CREATE TABLE IF NOT EXISTS "hips_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_no" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "hazard_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hips_version_id" uuid NOT NULL,
	CONSTRAINT "hazard_type_hips_version_id_fk" FOREIGN KEY ("hips_version_id")
		REFERENCES "hips_version"("id")
);

CREATE TABLE IF NOT EXISTS "hazard_cluster" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hazard_type_id" uuid NOT NULL,
	CONSTRAINT "hazard_cluster_hazard_type_id_fk" FOREIGN KEY ("hazard_type_id")
		REFERENCES "hazard_type"("id")
);

CREATE TABLE IF NOT EXISTS "specific_hazard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"hazard_cluster_id" uuid NOT NULL,
	CONSTRAINT "specific_hazard_hazard_cluster_id_fk" FOREIGN KEY ("hazard_cluster_id")
		REFERENCES "hazard_cluster"("id")
);



----
-- Source: 20260907120000_add_source_catalog_table.sql
----

CREATE TABLE IF NOT EXISTS "source_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country_accounts_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "source_catalog_country_accounts_id_fk" FOREIGN KEY ("country_accounts_id")
		REFERENCES "country_accounts"("id")
		ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_catalog_country_accounts_id_name_unique"
	ON "source_catalog" ("country_accounts_id", "name");


----
-- Source: 20260907130000_add_hazard_driver_tables.sql
----

CREATE TABLE IF NOT EXISTS "hazard_driver" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country_accounts_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "hazard_driver_country_accounts_id_fk" FOREIGN KEY ("country_accounts_id")
		REFERENCES "country_accounts"("id")
		ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazard_driver_country_accounts_id_idx"
	ON "hazard_driver" ("country_accounts_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hazardous_event_hazard_driver" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hazardous_event_id" uuid NOT NULL,
	"hazard_driver_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "hazardous_event_hazard_driver_hazardous_event_id_fk" FOREIGN KEY ("hazardous_event_id")
		REFERENCES "hazardous_event"("id")
		ON DELETE CASCADE,
	CONSTRAINT "hazardous_event_hazard_driver_hazard_driver_id_fk" FOREIGN KEY ("hazard_driver_id")
		REFERENCES "hazard_driver"("id")
		ON DELETE CASCADE,
	CONSTRAINT "hazardous_event_hazard_driver_event_id_driver_id_unique" UNIQUE ("hazardous_event_id", "hazard_driver_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazardous_event_hazard_driver_event_id_idx"
	ON "hazardous_event_hazard_driver" ("hazardous_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazardous_event_hazard_driver_driver_id_idx"
	ON "hazardous_event_hazard_driver" ("hazard_driver_id");


----
-- Source: 20260907140000_add_hazardous_event_causality_table.sql
----

CREATE TABLE IF NOT EXISTS "hazardous_event_causality" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cause_hazardous_event_id" uuid NOT NULL,
	"effect_hazardous_event_id" uuid NOT NULL,
	"causality_explanation" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "hazardous_event_causality_cause_hazardous_event_id_fk" FOREIGN KEY ("cause_hazardous_event_id")
		REFERENCES "hazardous_event"("id")
		ON DELETE CASCADE,
	CONSTRAINT "hazardous_event_causality_effect_hazardous_event_id_fk" FOREIGN KEY ("effect_hazardous_event_id")
		REFERENCES "hazardous_event"("id")
		ON DELETE CASCADE,
	CONSTRAINT "hazardous_event_causality_cause_effect_distinct_check" CHECK ("cause_hazardous_event_id" <> "effect_hazardous_event_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazardous_event_causality_cause_id_idx"
	ON "hazardous_event_causality" ("cause_hazardous_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazardous_event_causality_effect_id_idx"
	ON "hazardous_event_causality" ("effect_hazardous_event_id");


----
-- Source: 20260907150000_add_hazardous_event_spatial_observation_tables.sql
----

CREATE TABLE IF NOT EXISTS "hazardous_event_spatial_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hazardous_event_id" uuid NOT NULL,
	"observation_time" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "hazardous_event_spatial_observation_hazardous_event_id_fk" FOREIGN KEY ("hazardous_event_id")
		REFERENCES "hazardous_event"("id")
		ON DELETE CASCADE,
	CONSTRAINT "hazardous_event_spatial_observation_event_id_time_unique" UNIQUE ("hazardous_event_id", "observation_time")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hazardous_event_spatial_observation_division" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hazardous_event_spatial_observation_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "hazardous_event_spatial_observation_division_obs_id_fk" FOREIGN KEY ("hazardous_event_spatial_observation_id")
		REFERENCES "hazardous_event_spatial_observation"("id")
		ON DELETE CASCADE,
	CONSTRAINT "hazardous_event_spatial_observation_division_division_id_fk" FOREIGN KEY ("division_id")
		REFERENCES "division"("id"),
	CONSTRAINT "hazardous_event_spatial_observation_division_obs_div_unique" UNIQUE ("hazardous_event_spatial_observation_id", "division_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hazardous_event_spatial_observation_geom" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hazardous_event_spatial_observation_id" uuid NOT NULL,
	"geom" geometry(Geometry,4326) NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "hazardous_event_spatial_observation_geom_obs_id_fk" FOREIGN KEY ("hazardous_event_spatial_observation_id")
		REFERENCES "hazardous_event_spatial_observation"("id")
		ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazardous_event_spatial_observation_hazardous_event_id_idx"
	ON "hazardous_event_spatial_observation" ("hazardous_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazardous_event_spatial_observation_division_observation_id_idx"
	ON "hazardous_event_spatial_observation_division" ("hazardous_event_spatial_observation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazardous_event_spatial_observation_division_division_id_idx"
	ON "hazardous_event_spatial_observation_division" ("division_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazardous_event_spatial_observation_geom_observation_id_idx"
	ON "hazardous_event_spatial_observation_geom" ("hazardous_event_spatial_observation_id");



----
-- Source: 20260907160000_add_hazardous_event_attachment_table.sql
----

CREATE TABLE IF NOT EXISTS "hazardous_event_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hazardous_event_id" uuid NOT NULL,
	"title" text NOT NULL,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "hazardous_event_attachment_hazardous_event_id_fk" FOREIGN KEY ("hazardous_event_id")
		REFERENCES "hazardous_event"("id")
		ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazardous_event_attachment_hazardous_event_id_idx"
	ON "hazardous_event_attachment" ("hazardous_event_id");


----
-- Source: 20260907170000_add_hazard_type_field_tables.sql
----

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

----
-- Source: 20260909090000_add_specific_hazard_id_to_hazardous_event.sql
----

ALTER TABLE "hazardous_event"
  ADD COLUMN "specific_hazard_id" uuid
  CONSTRAINT "hazardous_event_specific_hazard_id_specific_hazard_id_fk"
  REFERENCES "specific_hazard"("id");


----
-- Source: 20260909100000_add_specific_hazard_names_to_hazardous_event.sql
----

ALTER TABLE "hazardous_event"
  ADD COLUMN "specific_hazard_local_name" text,
  ADD COLUMN "specific_hazard_national_name" text;


----
-- Source: 20260915065705_update_version_no_to_0_3_1.sql
----

UPDATE dts_system_info
SET version_no = '0.3.1',
updated_at = NOW();