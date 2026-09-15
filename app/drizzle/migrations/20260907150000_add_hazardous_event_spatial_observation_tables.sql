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
