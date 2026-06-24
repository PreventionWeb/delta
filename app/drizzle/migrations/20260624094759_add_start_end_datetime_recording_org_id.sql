CREATE TABLE "disaster_event_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"disaster_event_id" uuid,
	"file_key" text DEFAULT '' NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"file_type" text DEFAULT '' NOT NULL,
	"file_size" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disaster_event_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"disaster_event_id" uuid,
	"title" text,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "disaster_event" ADD COLUMN "recording_organization_id" uuid;--> statement-breakpoint
ALTER TABLE "disaster_event_attachment" ADD CONSTRAINT "disaster_event_attachment_disaster_event_id_disaster_event_id_fk" FOREIGN KEY ("disaster_event_id") REFERENCES "public"."disaster_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disaster_event_link" ADD CONSTRAINT "disaster_event_link_disaster_event_id_disaster_event_id_fk" FOREIGN KEY ("disaster_event_id") REFERENCES "public"."disaster_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disaster_event" ADD CONSTRAINT "fk_disaster_event_recording_org" FOREIGN KEY ("recording_organization_id","country_accounts_id") REFERENCES "public"."organization"("id","country_accounts_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disaster_event" DROP COLUMN "attachments";--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization___id_country_accounts_id" UNIQUE("id","country_accounts_id");