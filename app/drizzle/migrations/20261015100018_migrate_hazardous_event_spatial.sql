-- PostgreSQL 16 + PostGIS: migrate hazardous-event spatial data only.
-- All source and target tables must already exist in public.
-- One initial observation per event having at least one old geometry/division row.
-- observation_time is NULL (unknown); created_at is migration time, not event time.
-- Existing geometry UUIDs and titles are preserved. Division links are deduplicated
-- by event/division, keeping the lowest legacy UUID as the new link UUID.
-- No old table/data is changed; no permanent table or index is created.
-- The target observation_time NOT NULL constraint is removed to allow unknown times.
-- ONE-TIME migration: all three target tables must be empty. Re-running after a
-- successful commit aborts rather than duplicating data. Test on a backup first.
-- Pause application writes while running. On failure, run ROLLBACK in the same
-- connection and resolve the FIRST error. For a dry run, use ROLLBACK at the end.

BEGIN;
SET LOCAL search_path = public, pg_catalog;

-- 0. Legacy data has no observation timestamp; allow NULL instead of inventing one.
-- This schema change is part of the same transaction as the migration inserts.
ALTER TABLE public.hazardous_event_spatial_observation
ALTER COLUMN observation_time DROP NOT NULL;

-- 1. Stabilize sources and prevent concurrent writes to the destination tables.
LOCK TABLE public.hazardous_event, public.division,
           public.hazardous_event_geom, public.hazardous_event_division IN SHARE MODE;
LOCK TABLE public.hazardous_event_spatial_observation,
           public.hazardous_event_spatial_observation_division,
           public.hazardous_event_spatial_observation_geom IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.hazardous_event_spatial_observation)
       OR EXISTS (SELECT 1 FROM public.hazardous_event_spatial_observation_division)
       OR EXISTS (SELECT 1 FROM public.hazardous_event_spatial_observation_geom) THEN
        RAISE EXCEPTION 'Spatial target tables must be empty for this one-time migration. No data was removed.';
    END IF;

    -- Fail on missing parents or NULL associations rather than omitting rows.
    IF EXISTS (
        SELECT 1 FROM public.hazardous_event_geom g
        LEFT JOIN public.hazardous_event e ON e.id = g.hazardous_event_id
        WHERE e.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Old geometry has NULL/missing hazardous_event_id.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.hazardous_event_division d
        LEFT JOIN public.hazardous_event e ON e.id = d.hazardous_event_id
        LEFT JOIN public.division v ON v.id = d.division_id
        WHERE e.id IS NULL OR v.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Old division link has NULL/missing hazardous_event_id or division_id.';
    END IF;
END $$;

-- 2. Allocate a single observation UUID for each distinct event with spatial data.
-- UNION combines events with geometries, divisions, or both, without duplicates.
-- The fixed mapping is also reproducible when the same event UUID exists in
-- multiple instances. The namespace string must remain unchanged.
CREATE TEMP TABLE _spatial_event_map ON COMMIT DROP AS
SELECT hazardous_event_id,
       md5('delta:hazardous-event:initial-spatial-observation:' || hazardous_event_id::text)::uuid
           AS observation_id
FROM (
    SELECT hazardous_event_id FROM public.hazardous_event_geom
    UNION
    SELECT hazardous_event_id FROM public.hazardous_event_division
) events;
ALTER TABLE _spatial_event_map ADD PRIMARY KEY (hazardous_event_id);
ALTER TABLE _spatial_event_map ADD UNIQUE (observation_id);

-- 3. Stage distinct division associations to satisfy the target pair uniqueness.
-- The target column is division_id (the diagram's admin_area_id label is treated
-- as a label inconsistency, not as a second column).
CREATE TEMP TABLE _spatial_division_links ON COMMIT DROP AS
SELECT DISTINCT ON (hazardous_event_id, division_id)
       id, hazardous_event_id, division_id
FROM public.hazardous_event_division
ORDER BY hazardous_event_id, division_id, id;
ALTER TABLE _spatial_division_links ADD PRIMARY KEY (id);

-- 4. Insert initial observations. Do not infer observation_time from event dates.
-- No note existed in the old design, so note is NULL.
-- Both audit timestamps reflect insertion during this migration.
INSERT INTO public.hazardous_event_spatial_observation (
    id, hazardous_event_id, observation_time, note, created_at, updated_at
)
SELECT observation_id, hazardous_event_id, NULL::timestamptz,
       NULL::text, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM _spatial_event_map;

-- 5. Copy every old geometry directly: preserve UUID, SRID, coordinates, type,
-- dimensionality, title, and any NULL geometry. No transform/repair is applied.
INSERT INTO public.hazardous_event_spatial_observation_geom (
    id, hazardous_event_spatial_observation_id, geom, title
)
SELECT g.id, m.observation_id, g.geom, g.title
FROM public.hazardous_event_geom g
JOIN _spatial_event_map m ON m.hazardous_event_id = g.hazardous_event_id;

-- 6. Copy distinct division links. The division table itself is not modified.
INSERT INTO public.hazardous_event_spatial_observation_division (
    id, hazardous_event_spatial_observation_id, division_id
)
SELECT d.id, m.observation_id, d.division_id
FROM _spatial_division_links d
JOIN _spatial_event_map m ON m.hazardous_event_id = d.hazardous_event_id;

-- 7. Validate counts, associations, titles, and exact geometry content.
-- Any exception aborts the transaction; ROLLBACK undoes all inserts.
DO $$
BEGIN
    IF (SELECT count(*) FROM public.hazardous_event_spatial_observation)
           <> (SELECT count(*) FROM _spatial_event_map)
       OR (SELECT count(*) FROM public.hazardous_event_spatial_observation_geom)
           <> (SELECT count(*) FROM public.hazardous_event_geom)
       OR (SELECT count(*) FROM public.hazardous_event_spatial_observation_division)
           <> (SELECT count(*) FROM _spatial_division_links) THEN
        RAISE EXCEPTION 'Spatial migration validation failed: row counts differ.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM _spatial_event_map m
        LEFT JOIN public.hazardous_event_spatial_observation o ON o.id = m.observation_id
        WHERE o.id IS NULL OR o.hazardous_event_id IS DISTINCT FROM m.hazardous_event_id
           OR o.observation_time IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Spatial migration validation failed: observation association/time differs.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.hazardous_event_geom old
        JOIN _spatial_event_map m ON m.hazardous_event_id = old.hazardous_event_id
        LEFT JOIN public.hazardous_event_spatial_observation_geom new ON new.id = old.id
        WHERE new.id IS NULL
           OR new.hazardous_event_spatial_observation_id IS DISTINCT FROM m.observation_id
           OR new.title IS DISTINCT FROM old.title
           OR ST_AsEWKB(new.geom) IS DISTINCT FROM ST_AsEWKB(old.geom)
    ) THEN
        RAISE EXCEPTION 'Spatial migration validation failed: geometry/title/association differs.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM _spatial_division_links old
        JOIN _spatial_event_map m ON m.hazardous_event_id = old.hazardous_event_id
        LEFT JOIN public.hazardous_event_spatial_observation_division new ON new.id = old.id
        WHERE new.id IS NULL
           OR new.hazardous_event_spatial_observation_id IS DISTINCT FROM m.observation_id
           OR new.division_id IS DISTINCT FROM old.division_id
    ) THEN
        RAISE EXCEPTION 'Spatial migration validation failed: division association differs.';
    END IF;
END $$;

-- 8. Display migration totals, including any duplicate old division links merged.
SELECT 'observations' AS item, count(*) AS row_count
FROM public.hazardous_event_spatial_observation
UNION ALL
SELECT 'geometries copied', count(*) FROM public.hazardous_event_spatial_observation_geom
UNION ALL
SELECT 'distinct division links copied', count(*) FROM public.hazardous_event_spatial_observation_division
UNION ALL
SELECT 'duplicate legacy division links merged',
       (SELECT count(*) FROM public.hazardous_event_division)
       - (SELECT count(*) FROM _spatial_division_links);

COMMIT;
