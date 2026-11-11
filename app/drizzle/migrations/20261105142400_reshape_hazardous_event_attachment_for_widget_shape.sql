DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE t.typname = 'hazardous_event_attachment_type'
			AND n.nspname = 'public'
	) THEN
		CREATE TYPE public.hazardous_event_attachment_type AS ENUM ('File', 'Link');
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "hazardous_event_attachment" ADD COLUMN IF NOT EXISTS "url" text;
--> statement-breakpoint
ALTER TABLE "hazardous_event_attachment" ADD COLUMN IF NOT EXISTS "tag" jsonb;
--> statement-breakpoint
ALTER TABLE "hazardous_event_attachment" ADD COLUMN IF NOT EXISTS "type" public.hazardous_event_attachment_type;
--> statement-breakpoint
ALTER TABLE "hazardous_event_attachment" ALTER COLUMN "file_key" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "hazardous_event_attachment" ALTER COLUMN "file_name" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "hazardous_event_attachment" ALTER COLUMN "file_type" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "hazardous_event_attachment" ALTER COLUMN "file_size" DROP NOT NULL;
--> statement-breakpoint
-- Every pre-existing row was inserted by the pre-ca-shared-attachments-module code path, which
-- required all four file_* columns -- never through the real widget -- so 'File' is correct for
-- all of them (design.md Migration Plan; DEF-054's own finding, not the separate Phase M
-- legacy-JSONB backfill, which stays untouched and out of scope).
UPDATE "hazardous_event_attachment" SET "type" = 'File' WHERE "type" IS NULL;
--> statement-breakpoint
ALTER TABLE "hazardous_event_attachment" ALTER COLUMN "type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "hazardous_event_attachment" ADD CONSTRAINT "hazardous_event_attachment_type_check" CHECK (
	(
		"type" = 'File'
		AND "file_key" IS NOT NULL
		AND "file_name" IS NOT NULL
		AND "file_type" IS NOT NULL
		AND "file_size" IS NOT NULL
		AND "url" IS NULL
	)
	OR
	(
		"type" = 'Link'
		AND "url" IS NOT NULL
		AND "file_key" IS NULL
		AND "file_name" IS NULL
		AND "file_type" IS NULL
		AND "file_size" IS NULL
	)
);
