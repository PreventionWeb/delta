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
