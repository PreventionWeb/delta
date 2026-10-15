-- One-time data migration:
-- Copy causality links from event_relationship into hazardous_event_causality
-- when both endpoints are hazardous events.
--
-- Mapping:
-- - event_relationship.parent_id -> hazardous_event_causality.cause_hazardous_event_id
-- - event_relationship.child_id  -> hazardous_event_causality.effect_hazardous_event_id
--


BEGIN;
SET LOCAL search_path = public, pg_catalog;

-- 1) Build migration source:
--    only relationships where parent and child both exist in hazardous_event.
WITH migration_source AS (
	SELECT DISTINCT
		er.parent_id AS cause_hazardous_event_id,
		er.child_id AS effect_hazardous_event_id
	FROM public.event_relationship er
	INNER JOIN public.hazardous_event parent_he
		ON parent_he.id = er.parent_id
	INNER JOIN public.hazardous_event child_he
		ON child_he.id = er.child_id
	WHERE er.parent_id <> er.child_id
)
INSERT INTO public.hazardous_event_causality (
	cause_hazardous_event_id,
	effect_hazardous_event_id
)
SELECT
	ms.cause_hazardous_event_id,
	ms.effect_hazardous_event_id
FROM migration_source ms
WHERE NOT EXISTS (
	SELECT 1
	FROM public.hazardous_event_causality hec
	WHERE hec.cause_hazardous_event_id = ms.cause_hazardous_event_id
		AND hec.effect_hazardous_event_id = ms.effect_hazardous_event_id
);

-- 2) Post-check: ensure no eligible source pair is missing after migration.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM (
			SELECT DISTINCT
				er.parent_id AS cause_hazardous_event_id,
				er.child_id AS effect_hazardous_event_id
			FROM public.event_relationship er
			INNER JOIN public.hazardous_event parent_he
				ON parent_he.id = er.parent_id
			INNER JOIN public.hazardous_event child_he
				ON child_he.id = er.child_id
			WHERE er.parent_id <> er.child_id
		) src
		LEFT JOIN public.hazardous_event_causality hec
			ON hec.cause_hazardous_event_id = src.cause_hazardous_event_id
			AND hec.effect_hazardous_event_id = src.effect_hazardous_event_id
		WHERE hec.id IS NULL
	) THEN
		RAISE EXCEPTION
			'Migration incomplete: some eligible event_relationship pairs were not copied to hazardous_event_causality.';
	END IF;
END $$;

COMMIT;