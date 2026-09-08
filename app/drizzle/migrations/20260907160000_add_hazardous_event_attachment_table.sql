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
