-- One-time data migration for hazardous_event:
-- move references from hip_hazard_id (legacy) to specific_hazard_id (UUID FK).
--
-- IMPORTANT:
-- - Review and run manually in the target environment.
-- - Do not run automatically from app startup/migrations.

BEGIN;
SET LOCAL search_path = public, pg_catalog;

-- 1) Fail fast if any legacy hazard id cannot be mapped to specific_hazard.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.hazardous_event he
		LEFT JOIN public.specific_hazard sh
			ON sh.source_ref_id = he.hip_hazard_id
		WHERE he.hip_hazard_id IS NOT NULL
			AND sh.id IS NULL
	) THEN
		RAISE EXCEPTION
			'Cannot migrate hazardous_event: one or more hip_hazard_id values have no matching specific_hazard.source_ref_id.';
	END IF;
END $$;

-- 2) Backfill specific_hazard_id from the deterministic mapping.
UPDATE public.hazardous_event he
SET specific_hazard_id = sh.id
FROM public.specific_hazard sh
WHERE he.hip_hazard_id IS NOT NULL
	AND sh.source_ref_id = he.hip_hazard_id
	AND he.specific_hazard_id IS DISTINCT FROM sh.id;

-- 3) Sanity-check: every non-null hip_hazard_id should now have a specific_hazard_id.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.hazardous_event
		WHERE hip_hazard_id IS NOT NULL
			AND specific_hazard_id IS NULL
	) THEN
		RAISE EXCEPTION
			'Migration incomplete: some hazardous_event rows still have hip_hazard_id but NULL specific_hazard_id.';
	END IF;
END $$;

COMMIT;