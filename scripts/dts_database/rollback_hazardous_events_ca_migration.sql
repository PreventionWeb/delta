-- Rollback procedure for the CA hazardous-events migration (Ma).
--
-- Invariant 2 (expand-only) is the key property:
-- - Ma's migration only INSERTs into new CA tables.
-- - Legacy/source tables are not modified by Ma.
--
-- Therefore rollback is intentionally lightweight:
-- 1) TRUNCATE the new CA tables populated by Ma.
-- 2) Re-run scripts/dts_database/migrate_hazardous_events_to_ca_schema.sql
--    after fixes.
--
-- This is NOT a point-in-time restore workflow.
--
-- Safety note:
-- - Execute manually in a controlled environment.
-- - Run only when the tables below are considered migration targets.
BEGIN;

SET
	LOCAL search_path = public,
	pg_catalog;

-- update hazardous_event set specific_hazard_id = null;
UPDATE hazardous_event
set
	specific_hazard_id = null;

TRUNCATE TABLE
-- Workflow backfill (children first)
public.workflow_notification,
public.workflow_history,
public.workflow_instance,
-- Spatial observation backfill (children first)
public.hazardous_event_spatial_observation_geom,
public.hazardous_event_spatial_observation_division,
public.hazardous_event_spatial_observation
-- HIPs transaction backfill
public.language,
public.translation,
public.text_content
-- HIPs Management
public.hip_version,
public.hazard_type,
public.hazard_cluster,
public.specific_hazard RESTART IDENTITY;

COMMIT;