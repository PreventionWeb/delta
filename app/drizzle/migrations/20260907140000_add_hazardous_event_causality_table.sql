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
