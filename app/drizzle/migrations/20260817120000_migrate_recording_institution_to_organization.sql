UPDATE disaster_event
SET recording_institution = regexp_replace(
	btrim(recording_institution),
	'\s+',
	' ',
	'g'
)
WHERE recording_institution IS NOT NULL;

WITH normalized_events AS (
	SELECT
		de.id AS disaster_event_id,
		de.country_accounts_id,
		regexp_replace(btrim(de.recording_institution), '\s+', ' ', 'g') AS normalized_name
	FROM disaster_event de
	WHERE de.recording_organization_id IS NULL
		AND COALESCE(btrim(de.recording_institution), '') <> ''
),
distinct_pairs AS (
	SELECT DISTINCT
		ne.country_accounts_id,
		ne.normalized_name
	FROM normalized_events ne
)
INSERT INTO organization (name, country_accounts_id)
SELECT
	dp.normalized_name,
	dp.country_accounts_id
FROM distinct_pairs dp
WHERE NOT EXISTS (
	SELECT 1
	FROM organization o
	WHERE o.country_accounts_id IS NOT DISTINCT FROM dp.country_accounts_id
		AND regexp_replace(btrim(o.name), '\s+', ' ', 'g') = dp.normalized_name
);

WITH normalized_events AS (
	SELECT
		de.id AS disaster_event_id,
		de.country_accounts_id,
		regexp_replace(btrim(de.recording_institution), '\s+', ' ', 'g') AS normalized_name
	FROM disaster_event de
	WHERE de.recording_organization_id IS NULL
		AND COALESCE(btrim(de.recording_institution), '') <> ''
),
matched_organizations AS (
	SELECT DISTINCT ON (ne.disaster_event_id)
		ne.disaster_event_id,
		o.id AS organization_id
	FROM normalized_events ne
	JOIN organization o
		ON o.country_accounts_id IS NOT DISTINCT FROM ne.country_accounts_id
		AND regexp_replace(btrim(o.name), '\s+', ' ', 'g') = ne.normalized_name
	ORDER BY ne.disaster_event_id, o.id::text
)
UPDATE disaster_event de
SET recording_organization_id = mo.organization_id
FROM matched_organizations mo
WHERE de.id = mo.disaster_event_id
	AND de.recording_organization_id IS NULL;
