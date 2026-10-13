
BEGIN;
--> statement-breakpoint

ALTER TABLE public.language
ALTER COLUMN language_cd TYPE varchar(35);
--> statement-breakpoint

ALTER TABLE public.language
DROP CONSTRAINT language_cd_length_check;
--> statement-breakpoint

-- Same permissive shape as resolveLocale.ts's BCP_47_PATTERN 
ALTER TABLE public.language
ADD CONSTRAINT language_cd_format_check CHECK (language_cd ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$');
--> statement-breakpoint

COMMIT;
