-- Explicit BEGIN/COMMIT: the two adopted migrations this one runs after have zero
-- statement-breakpoints and embed their own literal BEGIN/COMMIT, which closes the
-- migrator's outer transaction early and leaves every later statement auto-committing
-- individually. Without its own BEGIN/COMMIT, a failure partway through this migration
-- would leave it permanently half-applied.
BEGIN;
--> statement-breakpoint

-- Constraint name is looked up dynamically: the unnamed inline REFERENCES in the
-- adopted migration left Postgres to assign the default name, which can't be hardcoded.
DO $$
DECLARE fk_name text;
BEGIN
    SELECT conname INTO fk_name
    FROM pg_constraint
    WHERE conrelid = 'public.hazard_type'::regclass
      AND confrelid = 'public.hips_version'::regclass
      AND contype = 'f';
    ALTER TABLE public.hazard_type RENAME COLUMN hip_version_id TO hips_version_id;
    EXECUTE format('ALTER TABLE public.hazard_type RENAME CONSTRAINT %I TO hazard_type_hips_version_id_fk', fk_name);
END $$;
--> statement-breakpoint

-- Postgres has no ALTER ... SET ON DELETE; the FK must be dropped and re-added.
DO $$
DECLARE fk_name text;
BEGIN
    SELECT conname INTO fk_name
    FROM pg_constraint
    WHERE conrelid = 'public.translation'::regclass
      AND confrelid = 'public.text_content'::regclass
      AND contype = 'f';
    EXECUTE format('ALTER TABLE public.translation DROP CONSTRAINT %I', fk_name);
    EXECUTE format(
        'ALTER TABLE public.translation ADD CONSTRAINT %I FOREIGN KEY (text_content_id) REFERENCES public.text_content(id) ON DELETE CASCADE',
        fk_name
    );
END $$;
--> statement-breakpoint

ALTER TABLE public.hazard_type ALTER COLUMN name_text_content_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.hazard_cluster ALTER COLUMN name_text_content_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.specific_hazard ALTER COLUMN name_text_content_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.hazard_type ALTER COLUMN hips_version_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.hazard_cluster ALTER COLUMN hazard_type_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.specific_hazard ALTER COLUMN hazard_cluster_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.text_content ALTER COLUMN original_language_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.translation ALTER COLUMN text_content_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.translation ALTER COLUMN language_id SET NOT NULL;
--> statement-breakpoint

-- Backfills the same-language translation rows the adopted migration's step 7 skips
-- (5l/ADR-001 invariant). NOT EXISTS keeps a re-run idempotent.
INSERT INTO public.translation (text_content_id, language_id, translation)
SELECT id, original_language_id, original_text
FROM public.text_content
WHERE NOT EXISTS (
    SELECT 1 FROM public.translation t
    WHERE t.text_content_id = text_content.id
      AND t.language_id = text_content.original_language_id
);
--> statement-breakpoint

COMMIT;
