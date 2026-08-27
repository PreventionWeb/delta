
----
-- Source: 20260617141858_add_notices_table.sql
----
CREATE TABLE IF NOT EXISTS "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_accounts_id" uuid NOT NULL,
	"title_json" jsonb,
	"body_json" jsonb,
	"is_published" boolean DEFAULT false NOT NULL,
	"audience" text DEFAULT 'private' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "notices_country_accounts_id_fk" FOREIGN KEY ("country_accounts_id")
		REFERENCES "country_accounts"("id")
		ON DELETE CASCADE
);

----
-- Source: 20260617160000_notices_title_json_not_null.sql
----

ALTER TABLE "notices" ALTER COLUMN "title_json" SET NOT NULL;

----
-- Source: 20260623065836_migrate_attachments_data_attachments_column_to_disaster_event_attachment_table.sql
----

CREATE TABLE IF NOT EXISTS public.disaster_event_attachment (
	id uuid NOT NULL DEFAULT gen_random_uuid(),
	disaster_event_id uuid,
	file_key text NOT NULL DEFAULT ''::text,
	file_name text NOT NULL DEFAULT ''::text,
	file_type text NOT NULL DEFAULT ''::text,
	file_size bigint NOT NULL DEFAULT 0,
	created_at timestamp without time zone NOT NULL DEFAULT now(),
	updated_at timestamp without time zone NOT NULL DEFAULT now(),
	CONSTRAINT disaster_event_attachment_pkey PRIMARY KEY (id),
	CONSTRAINT disaster_event_attachment_disaster_event_id_fkey FOREIGN KEY (disaster_event_id)
		REFERENCES public.disaster_event (id) MATCH SIMPLE
		ON UPDATE NO ACTION
		ON DELETE CASCADE
);

INSERT INTO public.disaster_event_attachment (
	disaster_event_id,
	file_key,
	file_name,
	file_type,
	file_size
)
SELECT
	de.id AS disaster_event_id,
	COALESCE(elem -> 'file' ->> 'name', '') AS file_key,
	COALESCE(
		NULLIF(
			regexp_replace(COALESCE(elem -> 'file' ->> 'name', ''), '^.*/', ''),
			''
		),
		''
	) AS file_name,
	COALESCE(
		NULLIF(
			lower(
				regexp_replace(
					regexp_replace(COALESCE(elem -> 'file' ->> 'name', ''), '^.*/', ''),
					'^.*\.',
					''
				)
			),
			lower(regexp_replace(COALESCE(elem -> 'file' ->> 'name', ''), '^.*/', ''))
		),
		''
	) AS file_type,
	0 AS file_size
FROM public.disaster_event AS de
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(de.attachments) = 'array' THEN de.attachments
		WHEN jsonb_typeof(de.attachments) = 'string'
			THEN COALESCE(NULLIF(de.attachments #>> '{}', ''), '[]')::jsonb
		ELSE '[]'::jsonb
	END
) AS elem
WHERE de.attachments IS NOT NULL
	AND COALESCE(elem -> 'file' ->> 'name', '') <> '';


----
-- Source: 20260624063451_migrate_links_data_from+attachements_column_to_disaster_event_link_table.sql
----

CREATE TABLE IF NOT EXISTS public.disaster_event_link (
	id uuid NOT NULL DEFAULT gen_random_uuid(),
	disaster_event_id uuid,
	title text,
	url text NOT NULL,
	created_at timestamp with time zone NOT NULL DEFAULT now(),
	updated_at timestamp with time zone,
	CONSTRAINT disaster_event_link_pkey PRIMARY KEY (id),
	CONSTRAINT disaster_event_link_disaster_event_id_fkey FOREIGN KEY (disaster_event_id)
		REFERENCES public.disaster_event (id) MATCH SIMPLE
		ON UPDATE NO ACTION
		ON DELETE CASCADE
);

INSERT INTO public.disaster_event_link (
	disaster_event_id,
	title,
	url
)

SELECT
	de.id AS disaster_event_id,
	NULLIF(COALESCE(elem ->> 'title', ''), '') AS title,
	COALESCE(elem ->> 'url', '') AS url
FROM public.disaster_event AS de
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(de.attachments) = 'array' THEN de.attachments
		WHEN jsonb_typeof(de.attachments) = 'string'
			THEN COALESCE(NULLIF(de.attachments #>> '{}', ''), '[]')::jsonb
		ELSE '[]'::jsonb
	END
) AS elem
WHERE de.attachments IS NOT NULL
	AND btrim(COALESCE(elem ->> 'url', '')) <> '';

ALTER TABLE public.disaster_event
	DROP COLUMN attachments;

----
-- Source: 20260624094759_add_start_end_datetime_recording_org_id.sql
----

ALTER TABLE disaster_event ADD COLUMN start_date_time time with time zone;
ALTER TABLE disaster_event ADD COLUMN end_date_time time with time zone;

ALTER TABLE disaster_event
ADD COLUMN recording_organization_id UUID NULL;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'organization___id_country_accounts_id'
	) THEN
		ALTER TABLE organization
		ADD CONSTRAINT organization___id_country_accounts_id
		UNIQUE (id, country_accounts_id);
	END IF;
END $$;

ALTER TABLE disaster_event
ADD CONSTRAINT fk_disaster_event_recording_org
FOREIGN KEY (recording_organization_id, country_accounts_id)
REFERENCES organization (id, country_accounts_id);

----
-- Source: 20260629120000_add_event_causality.sql
----

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE t.typname = 'event_causality_entity_type'
			AND n.nspname = 'public'
	) THEN
		CREATE TYPE public.event_causality_entity_type AS ENUM ('HE', 'DE');
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.event_causality (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	triggering_entity_type public.event_causality_entity_type NOT NULL,
	triggering_hazardous_event_id uuid,
	triggering_disaster_event_id uuid,
	triggered_entity_type public.event_causality_entity_type NOT NULL,
	triggered_hazardous_event_id uuid,
	triggered_disaster_event_id uuid,
	created_at timestamp with time zone DEFAULT now() NOT NULL,
	updated_at timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT event_causality_triggering_hazardous_event_id_fkey FOREIGN KEY (triggering_hazardous_event_id)
		REFERENCES public.hazardous_event (id)
		ON DELETE CASCADE,
	CONSTRAINT event_causality_triggering_disaster_event_id_fkey FOREIGN KEY (triggering_disaster_event_id)
		REFERENCES public.disaster_event (id)
		ON DELETE CASCADE,
	CONSTRAINT event_causality_triggered_hazardous_event_id_fkey FOREIGN KEY (triggered_hazardous_event_id)
		REFERENCES public.hazardous_event (id)
		ON DELETE CASCADE,
	CONSTRAINT event_causality_triggered_disaster_event_id_fkey FOREIGN KEY (triggered_disaster_event_id)
		REFERENCES public.disaster_event (id)
		ON DELETE CASCADE,
	CONSTRAINT event_causality_triggering_entity_fk_check CHECK (
		(
			triggering_entity_type = 'HE'
			AND triggering_hazardous_event_id IS NOT NULL
			AND triggering_disaster_event_id IS NULL
		)
		OR
		(
			triggering_entity_type = 'DE'
			AND triggering_disaster_event_id IS NOT NULL
			AND triggering_hazardous_event_id IS NULL
		)
	),
	CONSTRAINT event_causality_triggered_entity_fk_check CHECK (
		(
			triggered_entity_type = 'HE'
			AND triggered_hazardous_event_id IS NOT NULL
			AND triggered_disaster_event_id IS NULL
		)
		OR
		(
			triggered_entity_type = 'DE'
			AND triggered_disaster_event_id IS NOT NULL
			AND triggered_hazardous_event_id IS NULL
		)
	)
);

CREATE INDEX IF NOT EXISTS event_causality_triggering_hazardous_event_id_idx
	ON public.event_causality USING btree (triggering_hazardous_event_id);

CREATE INDEX IF NOT EXISTS event_causality_triggering_disaster_event_id_idx
	ON public.event_causality USING btree (triggering_disaster_event_id);

CREATE INDEX IF NOT EXISTS event_causality_triggered_hazardous_event_id_idx
	ON public.event_causality USING btree (triggered_hazardous_event_id);

CREATE INDEX IF NOT EXISTS event_causality_triggered_disaster_event_id_idx
	ON public.event_causality USING btree (triggered_disaster_event_id);

CREATE INDEX IF NOT EXISTS disaster_event_hazardous_event_id_idx
	ON public.disaster_event USING btree (hazardous_event_id);

CREATE INDEX IF NOT EXISTS disaster_event_disaster_event_id_idx
	ON public.disaster_event USING btree (disaster_event_id);

----
-- Source: 20260723090000_notices_single_locale_content.sql
----

-- ADR-008 / design.md Decision 18: Notices content is single-locale, not a locale-map.
-- Zero real data in this synthetic pilot domain, so no backfill is needed.
ALTER TABLE "notices" DROP COLUMN "title_json";
ALTER TABLE "notices" DROP COLUMN "body_json";
ALTER TABLE "notices" ADD COLUMN "title" text NOT NULL;
ALTER TABLE "notices" ADD COLUMN "body" text;
ALTER TABLE "notices" ADD COLUMN "locale" text NOT NULL;


----
-- Source: 20260730042612_migration_spatial_footprint_columns_to_new_tables.sql
----

CREATE TABLE public.disaster_event_division (
	id uuid NOT NULL DEFAULT gen_random_uuid(),
	disaster_event_id uuid NOT NULL,
	division_id uuid NOT NULL,
	CONSTRAINT disaster_event_division_pkey PRIMARY KEY (id),
	CONSTRAINT disaster_event_division_disaster_event_id_division_id_unique
		UNIQUE (disaster_event_id, division_id),
	CONSTRAINT disaster_event_division_disaster_event_id_fkey
		FOREIGN KEY (disaster_event_id)
		REFERENCES public.disaster_event (id)
		ON DELETE CASCADE,
	CONSTRAINT disaster_event_division_division_id_fkey
		FOREIGN KEY (division_id)
		REFERENCES public.division (id)
);

CREATE TABLE public.disaster_event_geom (
	id uuid NOT NULL DEFAULT gen_random_uuid(),
	disaster_event_id uuid NOT NULL,
	geom geometry(Geometry,4326) NOT NULL,
	title text,
	CONSTRAINT disaster_event_geom_pkey PRIMARY KEY (id),
	CONSTRAINT disaster_event_geom_disaster_event_id_fkey
		FOREIGN KEY (disaster_event_id)
		REFERENCES public.disaster_event (id)
		ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS disaster_event_geom_geom_idx
	ON public.disaster_event_geom USING GIST (geom);

CREATE TABLE public.hazardous_event_division (
	id uuid NOT NULL DEFAULT gen_random_uuid(),
	hazardous_event_id uuid NOT NULL,
	division_id uuid NOT NULL,
	CONSTRAINT hazardous_event_division_pkey PRIMARY KEY (id),
	CONSTRAINT hazardous_event_division_hazardous_event_id_division_id_unique
		UNIQUE (hazardous_event_id, division_id),
	CONSTRAINT hazardous_event_division_hazardous_event_id_fkey
		FOREIGN KEY (hazardous_event_id)
		REFERENCES public.hazardous_event (id)
		ON DELETE CASCADE,
	CONSTRAINT hazardous_event_division_division_id_fkey
		FOREIGN KEY (division_id)
		REFERENCES public.division (id)
);

CREATE TABLE public.hazardous_event_geom (
	id uuid NOT NULL DEFAULT gen_random_uuid(),
	hazardous_event_id uuid NOT NULL,
	geom geometry(Geometry,4326) NOT NULL,
	title text,
	CONSTRAINT hazardous_event_geom_pkey PRIMARY KEY (id),
	CONSTRAINT hazardous_event_geom_hazardous_event_id_fkey
		FOREIGN KEY (hazardous_event_id)
		REFERENCES public.hazardous_event (id)
		ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS hazardous_event_geom_geom_idx
	ON public.hazardous_event_geom USING GIST (geom);

CREATE TABLE public.disaster_records_division (
	id uuid NOT NULL DEFAULT gen_random_uuid(),
	disaster_record_id uuid NOT NULL,
	division_id uuid NOT NULL,
	CONSTRAINT disaster_records_division_pkey PRIMARY KEY (id),
	CONSTRAINT disaster_records_division_disaster_record_id_division_id_unique
		UNIQUE (disaster_record_id, division_id),
	CONSTRAINT disaster_records_division_disaster_record_id_fkey
		FOREIGN KEY (disaster_record_id)
		REFERENCES public.disaster_records (id)
		ON DELETE CASCADE,
	CONSTRAINT disaster_records_division_division_id_fkey
		FOREIGN KEY (division_id)
		REFERENCES public.division (id)
);

CREATE TABLE public.disaster_records_geom (
	id uuid NOT NULL DEFAULT gen_random_uuid(),
	disaster_record_id uuid NOT NULL,
	geom geometry(Geometry,4326) NOT NULL,
	title text,
	CONSTRAINT disaster_records_geom_pkey PRIMARY KEY (id),
	CONSTRAINT disaster_records_geom_disaster_record_id_fkey
		FOREIGN KEY (disaster_record_id)
		REFERENCES public.disaster_records (id)
		ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS disaster_records_geom_geom_idx
	ON public.disaster_records_geom USING GIST (geom);

CREATE TABLE public.damages_division (
	id uuid NOT NULL DEFAULT gen_random_uuid(),
	damage_id uuid NOT NULL,
	division_id uuid NOT NULL,
	CONSTRAINT damages_division_pkey PRIMARY KEY (id),
	CONSTRAINT damages_division_damage_id_division_id_unique
		UNIQUE (damage_id, division_id),
	CONSTRAINT damages_division_damage_id_fkey
		FOREIGN KEY (damage_id)
		REFERENCES public.damages (id)
		ON DELETE CASCADE,
	CONSTRAINT damages_division_division_id_fkey
		FOREIGN KEY (division_id)
		REFERENCES public.division (id)
);

CREATE TABLE public.damages_geom (
	id uuid NOT NULL DEFAULT gen_random_uuid(),
	damage_id uuid NOT NULL,
	geom geometry(Geometry,4326) NOT NULL,
	title text,
	CONSTRAINT damages_geom_pkey PRIMARY KEY (id),
	CONSTRAINT damages_geom_damage_id_fkey
		FOREIGN KEY (damage_id)
		REFERENCES public.damages (id)
		ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS damages_geom_geom_idx
	ON public.damages_geom USING GIST (geom);

CREATE TABLE public.disruption_division (
	id uuid NOT NULL DEFAULT gen_random_uuid(),
	disruption_id uuid NOT NULL,
	division_id uuid NOT NULL,
	CONSTRAINT disruption_division_pkey PRIMARY KEY (id),
	CONSTRAINT disruption_division_disruption_id_division_id_unique
		UNIQUE (disruption_id, division_id),
	CONSTRAINT disruption_division_disruption_id_fkey
		FOREIGN KEY (disruption_id)
		REFERENCES public.disruption (id)
		ON DELETE CASCADE,
	CONSTRAINT disruption_division_division_id_fkey
		FOREIGN KEY (division_id)
		REFERENCES public.division (id)
);

CREATE TABLE public.disruption_geom (
	id uuid NOT NULL DEFAULT gen_random_uuid(),
	disruption_id uuid NOT NULL,
	geom geometry(Geometry,4326) NOT NULL,
	title text,
	CONSTRAINT disruption_geom_pkey PRIMARY KEY (id),
	CONSTRAINT disruption_geom_disruption_id_fkey
		FOREIGN KEY (disruption_id)
		REFERENCES public.disruption (id)
		ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS disruption_geom_geom_idx
	ON public.disruption_geom USING GIST (geom);

CREATE TABLE public.losses_division (
	id uuid NOT NULL DEFAULT gen_random_uuid(),
	loss_id uuid NOT NULL,
	division_id uuid NOT NULL,
	CONSTRAINT losses_division_pkey PRIMARY KEY (id),
	CONSTRAINT losses_division_loss_id_division_id_unique
		UNIQUE (loss_id, division_id),
	CONSTRAINT losses_division_loss_id_fkey
		FOREIGN KEY (loss_id)
		REFERENCES public.losses (id)
		ON DELETE CASCADE,
	CONSTRAINT losses_division_division_id_fkey
		FOREIGN KEY (division_id)
		REFERENCES public.division (id)
);

CREATE TABLE public.losses_geom (
	id uuid NOT NULL DEFAULT gen_random_uuid(),
	loss_id uuid NOT NULL,
	geom geometry(Geometry,4326) NOT NULL,
	title text,
	CONSTRAINT losses_geom_pkey PRIMARY KEY (id),
	CONSTRAINT losses_geom_loss_id_fkey
		FOREIGN KEY (loss_id)
		REFERENCES public.losses (id)
		ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS losses_geom_geom_idx
	ON public.losses_geom USING GIST (geom);

INSERT INTO public.disaster_event_geom (disaster_event_id, geom, title)
SELECT
	de.id,
	ST_SetSRID(
		ST_GeomFromGeoJSON((elem -> 'geojson' -> 'geometry')::text),
		4326
	),
	NULLIF(elem ->> 'title', '')
FROM public.disaster_event AS de
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(de.spatial_footprint) = 'array'
			THEN de.spatial_footprint
		WHEN jsonb_typeof(de.spatial_footprint) = 'string'
			THEN COALESCE(NULLIF(de.spatial_footprint #>> '{}', ''), '[]')::jsonb
		ELSE '[]'::jsonb
	END
) AS elem
WHERE de.spatial_footprint IS NOT NULL
	AND elem ->> 'map_option' = 'Map coordinates'
	AND jsonb_typeof(elem -> 'geojson' -> 'geometry') = 'object'
	AND COALESCE(elem -> 'geojson' -> 'geometry' ->> 'type', '') <> ''
	AND elem -> 'geojson' -> 'geometry' -> 'coordinates' IS NOT NULL;

INSERT INTO public.disaster_event_division (disaster_event_id, division_id)
SELECT
	de.id,
	d.id
FROM public.disaster_event AS de
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(de.spatial_footprint) = 'array'
			THEN de.spatial_footprint
		WHEN jsonb_typeof(de.spatial_footprint) = 'string'
			THEN COALESCE(NULLIF(de.spatial_footprint #>> '{}', ''), '[]')::jsonb
		ELSE '[]'::jsonb
	END
) AS elem
JOIN public.division AS d
	ON d.id = (elem -> 'geojson' -> 'properties' ->> 'division_id')::uuid
WHERE de.spatial_footprint IS NOT NULL
	AND elem ->> 'map_option' = 'Geographic level'
	AND COALESCE(elem -> 'geojson' -> 'properties' ->> 'division_id', '')
		~* '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
ON CONFLICT (disaster_event_id, division_id) DO NOTHING;

INSERT INTO public.hazardous_event_geom (hazardous_event_id, geom, title)
SELECT
	he.id,
	ST_SetSRID(
		ST_GeomFromGeoJSON((elem -> 'geojson' -> 'geometry')::text),
		4326
	),
	NULLIF(elem ->> 'title', '')
FROM public.hazardous_event AS he
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(he.spatial_footprint) = 'array'
			THEN he.spatial_footprint
		WHEN jsonb_typeof(he.spatial_footprint) = 'string'
			THEN COALESCE(NULLIF(he.spatial_footprint #>> '{}', ''), '[]')::jsonb
		ELSE '[]'::jsonb
	END
) AS elem
WHERE he.spatial_footprint IS NOT NULL
	AND elem ->> 'map_option' = 'Map coordinates'
	AND jsonb_typeof(elem -> 'geojson' -> 'geometry') = 'object'
	AND COALESCE(elem -> 'geojson' -> 'geometry' ->> 'type', '') <> ''
	AND elem -> 'geojson' -> 'geometry' -> 'coordinates' IS NOT NULL;

INSERT INTO public.hazardous_event_division (
	hazardous_event_id,
	division_id
)
SELECT
	he.id,
	d.id
FROM public.hazardous_event AS he
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(he.spatial_footprint) = 'array'
			THEN he.spatial_footprint
		WHEN jsonb_typeof(he.spatial_footprint) = 'string'
			THEN COALESCE(NULLIF(he.spatial_footprint #>> '{}', ''), '[]')::jsonb
		ELSE '[]'::jsonb
	END
) AS elem
JOIN public.division AS d
	ON d.id = (elem -> 'geojson' -> 'properties' ->> 'division_id')::uuid
WHERE he.spatial_footprint IS NOT NULL
	AND elem ->> 'map_option' = 'Geographic level'
	AND COALESCE(elem -> 'geojson' -> 'properties' ->> 'division_id', '')
		~* '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
ON CONFLICT (hazardous_event_id, division_id) DO NOTHING;

INSERT INTO public.disaster_records_geom (disaster_record_id, geom, title)
SELECT
	dr.id,
	ST_SetSRID(
		ST_GeomFromGeoJSON((elem -> 'geojson' -> 'geometry')::text),
		4326
	),
	NULLIF(elem ->> 'title', '')
FROM public.disaster_records AS dr
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(dr.spatial_footprint) = 'array'
			THEN dr.spatial_footprint
		WHEN jsonb_typeof(dr.spatial_footprint) = 'string'
			THEN COALESCE(NULLIF(dr.spatial_footprint #>> '{}', ''), '[]')::jsonb
		ELSE '[]'::jsonb
	END
) AS elem
WHERE dr.spatial_footprint IS NOT NULL
	AND elem ->> 'map_option' = 'Map coordinates'
	AND jsonb_typeof(elem -> 'geojson' -> 'geometry') = 'object'
	AND COALESCE(elem -> 'geojson' -> 'geometry' ->> 'type', '') <> ''
	AND elem -> 'geojson' -> 'geometry' -> 'coordinates' IS NOT NULL;

INSERT INTO public.disaster_records_division (
	disaster_record_id,
	division_id
)
SELECT
	dr.id,
	d.id
FROM public.disaster_records AS dr
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(dr.spatial_footprint) = 'array'
			THEN dr.spatial_footprint
		WHEN jsonb_typeof(dr.spatial_footprint) = 'string'
			THEN COALESCE(NULLIF(dr.spatial_footprint #>> '{}', ''), '[]')::jsonb
		ELSE '[]'::jsonb
	END
) AS elem
JOIN public.division AS d
	ON d.id = (elem -> 'geojson' -> 'properties' ->> 'division_id')::uuid
WHERE dr.spatial_footprint IS NOT NULL
	AND elem ->> 'map_option' = 'Geographic level'
	AND COALESCE(elem -> 'geojson' -> 'properties' ->> 'division_id', '')
		~* '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
ON CONFLICT (disaster_record_id, division_id) DO NOTHING;

INSERT INTO public.damages_geom (damage_id, geom, title)
SELECT
	d.id,
	ST_SetSRID(
		ST_GeomFromGeoJSON((elem -> 'geojson' -> 'geometry')::text),
		4326
	),
	NULLIF(elem ->> 'title', '')
FROM public.damages AS d
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(d.spatial_footprint) = 'array'
			THEN d.spatial_footprint
		WHEN jsonb_typeof(d.spatial_footprint) = 'string'
			THEN COALESCE(NULLIF(d.spatial_footprint #>> '{}', ''), '[]')::jsonb
		ELSE '[]'::jsonb
	END
) AS elem
WHERE d.spatial_footprint IS NOT NULL
	AND elem ->> 'map_option' = 'Map coordinates'
	AND jsonb_typeof(elem -> 'geojson' -> 'geometry') = 'object'
	AND COALESCE(elem -> 'geojson' -> 'geometry' ->> 'type', '') <> ''
	AND elem -> 'geojson' -> 'geometry' -> 'coordinates' IS NOT NULL;

INSERT INTO public.damages_division (damage_id, division_id)
SELECT
	dm.id,
	d.id
FROM public.damages AS dm
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(dm.spatial_footprint) = 'array'
			THEN dm.spatial_footprint
		WHEN jsonb_typeof(dm.spatial_footprint) = 'string'
			THEN COALESCE(NULLIF(dm.spatial_footprint #>> '{}', ''), '[]')::jsonb
		ELSE '[]'::jsonb
	END
) AS elem
JOIN public.division AS d
	ON d.id = (elem -> 'geojson' -> 'properties' ->> 'division_id')::uuid
WHERE dm.spatial_footprint IS NOT NULL
	AND elem ->> 'map_option' = 'Geographic level'
	AND COALESCE(elem -> 'geojson' -> 'properties' ->> 'division_id', '')
		~* '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
ON CONFLICT (damage_id, division_id) DO NOTHING;

INSERT INTO public.disruption_geom (disruption_id, geom, title)
SELECT
	d.id,
	ST_SetSRID(
		ST_GeomFromGeoJSON((elem -> 'geojson' -> 'geometry')::text),
		4326
	),
	NULLIF(elem ->> 'title', '')
FROM public.disruption AS d
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(d.spatial_footprint) = 'array'
			THEN d.spatial_footprint
		WHEN jsonb_typeof(d.spatial_footprint) = 'string'
			THEN COALESCE(NULLIF(d.spatial_footprint #>> '{}', ''), '[]')::jsonb
		ELSE '[]'::jsonb
	END
) AS elem
WHERE d.spatial_footprint IS NOT NULL
	AND elem ->> 'map_option' = 'Map coordinates'
	AND jsonb_typeof(elem -> 'geojson' -> 'geometry') = 'object'
	AND COALESCE(elem -> 'geojson' -> 'geometry' ->> 'type', '') <> ''
	AND elem -> 'geojson' -> 'geometry' -> 'coordinates' IS NOT NULL;

INSERT INTO public.disruption_division (disruption_id, division_id)
SELECT
	ds.id,
	d.id
FROM public.disruption AS ds
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(ds.spatial_footprint) = 'array'
			THEN ds.spatial_footprint
		WHEN jsonb_typeof(ds.spatial_footprint) = 'string'
			THEN COALESCE(NULLIF(ds.spatial_footprint #>> '{}', ''), '[]')::jsonb
		ELSE '[]'::jsonb
	END
) AS elem
JOIN public.division AS d
	ON d.id = (elem -> 'geojson' -> 'properties' ->> 'division_id')::uuid
WHERE ds.spatial_footprint IS NOT NULL
	AND elem ->> 'map_option' = 'Geographic level'
	AND COALESCE(elem -> 'geojson' -> 'properties' ->> 'division_id', '')
		~* '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
ON CONFLICT (disruption_id, division_id) DO NOTHING;

INSERT INTO public.losses_geom (loss_id, geom, title)
SELECT
	l.id,
	ST_SetSRID(
		ST_GeomFromGeoJSON((elem -> 'geojson' -> 'geometry')::text),
		4326
	),
	NULLIF(elem ->> 'title', '')
FROM public.losses AS l
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(l.spatial_footprint) = 'array'
			THEN l.spatial_footprint
		WHEN jsonb_typeof(l.spatial_footprint) = 'string'
			THEN COALESCE(NULLIF(l.spatial_footprint #>> '{}', ''), '[]')::jsonb
		ELSE '[]'::jsonb
	END
) AS elem
WHERE l.spatial_footprint IS NOT NULL
	AND elem ->> 'map_option' = 'Map coordinates'
	AND jsonb_typeof(elem -> 'geojson' -> 'geometry') = 'object'
	AND COALESCE(elem -> 'geojson' -> 'geometry' ->> 'type', '') <> ''
	AND elem -> 'geojson' -> 'geometry' -> 'coordinates' IS NOT NULL;

INSERT INTO public.losses_division (loss_id, division_id)
SELECT
	l.id,
	d.id
FROM public.losses AS l
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(l.spatial_footprint) = 'array'
			THEN l.spatial_footprint
		WHEN jsonb_typeof(l.spatial_footprint) = 'string'
			THEN COALESCE(NULLIF(l.spatial_footprint #>> '{}', ''), '[]')::jsonb
		ELSE '[]'::jsonb
	END
) AS elem
JOIN public.division AS d
	ON d.id = (elem -> 'geojson' -> 'properties' ->> 'division_id')::uuid
WHERE l.spatial_footprint IS NOT NULL
	AND elem ->> 'map_option' = 'Geographic level'
	AND COALESCE(elem -> 'geojson' -> 'properties' ->> 'division_id', '')
		~* '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
ON CONFLICT (loss_id, division_id) DO NOTHING;

----
-- Source: 20260730071321_remove_spatial_footprint_columns.sql
----

ALTER TABLE disaster_event
DROP COLUMN IF EXISTS spatial_footprint;

ALTER TABLE hazardous_event
DROP COLUMN IF EXISTS spatial_footprint;

ALTER TABLE disaster_records
DROP COLUMN IF EXISTS spatial_footprint;

ALTER TABLE damages
DROP COLUMN IF EXISTS spatial_footprint;

ALTER TABLE disruption
DROP COLUMN IF EXISTS spatial_footprint;

ALTER TABLE losses
DROP COLUMN IF EXISTS spatial_footprint;


----
-- Source: 20260810035621_migrate_disaster_event_response_to_new_tables.sql
----

CREATE TABLE
    IF NOT EXISTS response_type (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
        type text NOT NULL,
        CONSTRAINT response_type_type_unique UNIQUE (type)
    );

CREATE TABLE
    IF NOT EXISTS disaster_event_response (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
        disaster_event_id uuid REFERENCES disaster_event (id) ON DELETE CASCADE,
        response_type_id uuid NOT NULL REFERENCES response_type (id),
        response_date timestamp
        with
            time zone,
            coverage text,
            description text
    );

CREATE INDEX IF NOT EXISTS disaster_event_response_disaster_event_id_idx ON disaster_event_response (disaster_event_id);

CREATE INDEX IF NOT EXISTS disaster_event_response_response_type_id_idx ON disaster_event_response (response_type_id);

CREATE TABLE
    IF NOT EXISTS disaster_event_response_attachment (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
        disaster_event_response_id uuid NOT NULL REFERENCES disaster_event_response (id) ON DELETE CASCADE,
        title text NOT NULL,
        file_key text NOT NULL,
        file_name text NOT NULL,
        file_type text NOT NULL,
        file_size bigint NOT NULL,
        created_at timestamp
        with
            time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at timestamp
        with
            time zone
    );

CREATE INDEX IF NOT EXISTS dis_event_resp_attachment_response_id_idx ON disaster_event_response_attachment (disaster_event_response_id);

INSERT INTO
    response_type (type)
VALUES
    ('Early action'),
    ('Response operation') ON CONFLICT (type) DO NOTHING;

WITH
    early_action_type AS (
        SELECT
            id
        FROM
            response_type
        WHERE
            type = 'Early action'
    )
INSERT INTO
    disaster_event_response (
        id,
        disaster_event_id,
        response_type_id,
        response_date,
        coverage,
        description
    )
SELECT
    gen_random_uuid (),
    de.id,
    eat.id,
    ea.response_date,
    NULL,
    NULLIF(BTRIM (ea.description), '')
FROM
    disaster_event de
    CROSS JOIN early_action_type eat
    CROSS JOIN LATERAL (
        VALUES
            (
                de.early_action_description1,
                de.early_action_date1
            ),
            (
                de.early_action_description2,
                de.early_action_date2
            ),
            (
                de.early_action_description3,
                de.early_action_date3
            ),
            (
                de.early_action_description4,
                de.early_action_date4
            ),
            (
                de.early_action_description5,
                de.early_action_date5
            )
    ) AS ea (description, response_date)
WHERE
    COALESCE(BTRIM (ea.description), '') <> ''
    OR ea.response_date IS NOT NULL;

WITH
    response_operation_type AS (
        SELECT
            id
        FROM
            response_type
        WHERE
            type = 'Response operation'
    )
INSERT INTO
    disaster_event_response (
        id,
        disaster_event_id,
        response_type_id,
        response_date,
        coverage,
        description
    )
SELECT
    gen_random_uuid (),
    de.id,
    rot.id,
    NULL,
    NULL,
    NULLIF(BTRIM (de.response_oprations), '')
FROM
    disaster_event de
    CROSS JOIN response_operation_type rot
WHERE
    COALESCE(BTRIM (de.response_oprations), '') <> '';

ALTER TABLE disaster_event
DROP COLUMN IF EXISTS early_action_description1,
DROP COLUMN IF EXISTS early_action_date1,
DROP COLUMN IF EXISTS early_action_description2,
DROP COLUMN IF EXISTS early_action_date2,
DROP COLUMN IF EXISTS early_action_description3,
DROP COLUMN IF EXISTS early_action_date3,
DROP COLUMN IF EXISTS early_action_description4,
DROP COLUMN IF EXISTS early_action_date4,
DROP COLUMN IF EXISTS early_action_description5,
DROP COLUMN IF EXISTS early_action_date5,
DROP COLUMN IF EXISTS response_oprations;

----
-- Source: 20260811034226_migrate_disaster_event_declaration_to_new_tables.sql
----

CREATE TABLE
    IF NOT EXISTS declaration_status (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
        status text NOT NULL,
        description text,
        CONSTRAINT declaration_status_status_unique UNIQUE (status)
    );

CREATE TABLE
    IF NOT EXISTS disaster_event_declaration (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
        disaster_event_id uuid NOT NULL REFERENCES disaster_event (id) ON DELETE CASCADE,
        type text,
        effects text,
        declaration_date timestamp
        with
            time zone,
            issuing_organization text,
            coverage text,
            declaration_status_id uuid REFERENCES declaration_status (id)
    );

CREATE INDEX IF NOT EXISTS dis_event_declaration_event_id_idx ON disaster_event_declaration (disaster_event_id);

CREATE INDEX IF NOT EXISTS dis_event_declaration_status_id_idx ON disaster_event_declaration (declaration_status_id);

CREATE TABLE
    IF NOT EXISTS disaster_event_declaration_attachment (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
        disaster_event_declaration_id uuid NOT NULL REFERENCES disaster_event_declaration (id) ON DELETE CASCADE,
        title text NOT NULL,
        file_key text NOT NULL,
        file_name text NOT NULL,
        file_type text NOT NULL,
        file_size bigint NOT NULL,
        created_at timestamp
        with
            time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at timestamp
        with
            time zone
    );

CREATE INDEX IF NOT EXISTS dis_event_decl_attachment_declaration_id_idx ON disaster_event_declaration_attachment (disaster_event_declaration_id);

INSERT INTO
    declaration_status (status, description)
VALUES
    (
        'Declared / In force',
        'The official declaration has been issued by the competent authority and is currently active and legally effective.'
    ),
    (
        'Extended',
        'The declaration has been formally renewed beyond its original validity period through a separate legal act or official approval.'
    ),
    (
        'Modified',
        'The declaration remains in force but has been amended, such as through escalation or de-escalation of the alert level, expansion or reduction of the affected area, or other substantive changes to its scope or conditions.'
    ),
    (
        'Lifted / Revoked',
        'The declaration has been formally terminated by the declaring or supervising authority before or at the end of its intended duration.'
    ),
    (
        'Expired',
        'The declaration has ceased to be in force automatically upon reaching its specified end date or time without formal renewal or extension.'
    ),
    (
        'Annulled / Invalidated',
        'The declaration has been declared legally invalid or void through judicial, legislative, or other competent legal review.'
    ) ON CONFLICT (status) DO
UPDATE
SET
    description = excluded.description;

INSERT INTO
    disaster_event_declaration (
        id,
        disaster_event_id,
        type,
        effects,
        declaration_date,
        issuing_organization,
        coverage,
        declaration_status_id
    )
SELECT
    gen_random_uuid (),
    de.id,
    NULL,
    NULLIF(BTRIM (dcl.effects), ''),
    dcl.declaration_date,
    NULL,
    NULL,
    NULL
FROM
    disaster_event de
    CROSS JOIN LATERAL (
        VALUES
            (
                de.disaster_declaration_type_and_effect1,
                de.disaster_declaration_date1
            ),
            (
                de.disaster_declaration_type_and_effect2,
                de.disaster_declaration_date2
            ),
            (
                de.disaster_declaration_type_and_effect3,
                de.disaster_declaration_date3
            ),
            (
                de.disaster_declaration_type_and_effect4,
                de.disaster_declaration_date4
            ),
            (
                de.disaster_declaration_type_and_effect5,
                de.disaster_declaration_date5
            )
    ) AS dcl (effects, declaration_date)
WHERE
    COALESCE(BTRIM (dcl.effects), '') <> ''
    OR dcl.declaration_date IS NOT NULL;

ALTER TABLE disaster_event
DROP COLUMN IF EXISTS disaster_declaration,
DROP COLUMN IF EXISTS disaster_declaration_type_and_effect1,
DROP COLUMN IF EXISTS disaster_declaration_date1,
DROP COLUMN IF EXISTS disaster_declaration_type_and_effect2,
DROP COLUMN IF EXISTS disaster_declaration_date2,
DROP COLUMN IF EXISTS disaster_declaration_type_and_effect3,
DROP COLUMN IF EXISTS disaster_declaration_date3,
DROP COLUMN IF EXISTS disaster_declaration_type_and_effect4,
DROP COLUMN IF EXISTS disaster_declaration_date4,
DROP COLUMN IF EXISTS disaster_declaration_type_and_effect5,
DROP COLUMN IF EXISTS disaster_declaration_date5;


----
-- Source: 20260813040826_migrate_disaster_event_assessment_to_new_tables.sql
----

CREATE TABLE
    IF NOT EXISTS assessment_type (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
        type text NOT NULL,
        CONSTRAINT assessment_type_type_unique UNIQUE (type)
    );

CREATE TABLE
    IF NOT EXISTS disaster_event_assessment (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
        disaster_event_id uuid NOT NULL REFERENCES disaster_event (id) ON DELETE CASCADE,
        assessment_type_id uuid NOT NULL REFERENCES assessment_type (id),
        coverage text,
        assessment_date timestamp
        with
            time zone,
            description text,
            other_sectors text
    );

CREATE INDEX IF NOT EXISTS dis_event_assessment_event_id_idx ON disaster_event_assessment (disaster_event_id);

CREATE INDEX IF NOT EXISTS dis_event_assessment_type_id_idx ON disaster_event_assessment (assessment_type_id);

CREATE TABLE
    IF NOT EXISTS disaster_event_assessment_sector (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
        disaster_event_assessment_id uuid NOT NULL REFERENCES disaster_event_assessment (id) ON DELETE CASCADE,
        sector_id uuid NOT NULL REFERENCES sector (id),
        CONSTRAINT dis_event_assessment_sector_assessment_id_sector_id_unique UNIQUE (disaster_event_assessment_id, sector_id)
    );

CREATE INDEX IF NOT EXISTS dis_event_assessment_sector_assessment_id_idx ON disaster_event_assessment_sector (disaster_event_assessment_id);

CREATE INDEX IF NOT EXISTS dis_event_assessment_sector_sector_id_idx ON disaster_event_assessment_sector (sector_id);

CREATE TABLE
    IF NOT EXISTS disaster_event_assessment_attachment (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
        disaster_event_assessment_id uuid NOT NULL REFERENCES disaster_event_assessment (id) ON DELETE CASCADE,
        title text NOT NULL,
        file_key text NOT NULL,
        file_name text NOT NULL,
        file_type text NOT NULL,
        file_size bigint NOT NULL,
        created_at timestamp
        with
            time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at timestamp
        with
            time zone
    );

CREATE INDEX IF NOT EXISTS dis_event_assessment_attachment_assessment_id_idx ON disaster_event_assessment_attachment (disaster_event_assessment_id);

INSERT INTO
    assessment_type (type)
VALUES
    ('Rapid/Preliminary assessment'),
    ('Post-disaster assessment'),
    ('Other assessment') ON CONFLICT (type) DO NOTHING;

INSERT INTO
    disaster_event_assessment (
        id,
        disaster_event_id,
        assessment_type_id,
        coverage,
        assessment_date,
        description,
        other_sectors
    )
SELECT
    gen_random_uuid (),
    de.id,
    at.id,
    NULL,
    a.assessment_date,
    NULLIF(BTRIM (a.description), ''),
    NULL
FROM
    disaster_event de
    CROSS JOIN LATERAL (
        VALUES
            (
                de.rapid_or_preliminary_assesment_description1,
                de.rapid_or_preliminary_assessment_date1
            ),
            (
                de.rapid_or_preliminary_assesment_description2,
                de.rapid_or_preliminary_assessment_date2
            ),
            (
                de.rapid_or_preliminary_assesment_description3,
                de.rapid_or_preliminary_assessment_date3
            ),
            (
                de.rapid_or_preliminary_assesment_description4,
                de.rapid_or_preliminary_assessment_date4
            ),
            (
                de.rapid_or_preliminary_assesment_description5,
                de.rapid_or_preliminary_assessment_date5
            )
    ) AS a (description, assessment_date)
    INNER JOIN assessment_type at ON at.type = 'Rapid/Preliminary assessment'
WHERE
    COALESCE(BTRIM (a.description), '') <> ''
    OR a.assessment_date IS NOT NULL;

INSERT INTO
    disaster_event_assessment (
        id,
        disaster_event_id,
        assessment_type_id,
        coverage,
        assessment_date,
        description,
        other_sectors
    )
SELECT
    gen_random_uuid (),
    de.id,
    at.id,
    NULL,
    a.assessment_date,
    NULLIF(BTRIM (a.description), ''),
    NULL
FROM
    disaster_event de
    CROSS JOIN LATERAL (
        VALUES
            (
                de.post_disaster_assessment_description1,
                de.post_disaster_assessment_date1
            ),
            (
                de.post_disaster_assessment_description2,
                de.post_disaster_assessment_date2
            ),
            (
                de.post_disaster_assessment_description3,
                de.post_disaster_assessment_date3
            ),
            (
                de.post_disaster_assessment_description4,
                de.post_disaster_assessment_date4
            ),
            (
                de.post_disaster_assessment_description5,
                de.post_disaster_assessment_date5
            )
    ) AS a (description, assessment_date)
    INNER JOIN assessment_type at ON at.type = 'Post-disaster assessment'
WHERE
    COALESCE(BTRIM (a.description), '') <> ''
    OR a.assessment_date IS NOT NULL;

INSERT INTO
    disaster_event_assessment (
        id,
        disaster_event_id,
        assessment_type_id,
        coverage,
        assessment_date,
        description,
        other_sectors
    )
SELECT
    gen_random_uuid (),
    de.id,
    at.id,
    NULL,
    a.assessment_date,
    NULLIF(BTRIM (a.description), ''),
    NULL
FROM
    disaster_event de
    CROSS JOIN LATERAL (
        VALUES
            (
                de.other_assessment_description1,
                de.other_assessment_date1
            ),
            (
                de.other_assessment_description2,
                de.other_assessment_date2
            ),
            (
                de.other_assessment_description3,
                de.other_assessment_date3
            ),
            (
                de.other_assessment_description4,
                de.other_assessment_date4
            ),
            (
                de.other_assessment_description5,
                de.other_assessment_date5
            )
    ) AS a (description, assessment_date)
    INNER JOIN assessment_type at ON at.type = 'Other assessment'
WHERE
    COALESCE(BTRIM (a.description), '') <> ''
    OR a.assessment_date IS NOT NULL;

ALTER TABLE disaster_event
DROP COLUMN IF EXISTS rapid_or_preliminary_assesment_description1,
DROP COLUMN IF EXISTS rapid_or_preliminary_assessment_date1,
DROP COLUMN IF EXISTS rapid_or_preliminary_assesment_description2,
DROP COLUMN IF EXISTS rapid_or_preliminary_assessment_date2,
DROP COLUMN IF EXISTS rapid_or_preliminary_assesment_description3,
DROP COLUMN IF EXISTS rapid_or_preliminary_assessment_date3,
DROP COLUMN IF EXISTS rapid_or_preliminary_assesment_description4,
DROP COLUMN IF EXISTS rapid_or_preliminary_assessment_date4,
DROP COLUMN IF EXISTS rapid_or_preliminary_assesment_description5,
DROP COLUMN IF EXISTS rapid_or_preliminary_assessment_date5,
DROP COLUMN IF EXISTS post_disaster_assessment_description1,
DROP COLUMN IF EXISTS post_disaster_assessment_date1,
DROP COLUMN IF EXISTS post_disaster_assessment_description2,
DROP COLUMN IF EXISTS post_disaster_assessment_date2,
DROP COLUMN IF EXISTS post_disaster_assessment_description3,
DROP COLUMN IF EXISTS post_disaster_assessment_date3,
DROP COLUMN IF EXISTS post_disaster_assessment_description4,
DROP COLUMN IF EXISTS post_disaster_assessment_date4,
DROP COLUMN IF EXISTS post_disaster_assessment_description5,
DROP COLUMN IF EXISTS post_disaster_assessment_date5,
DROP COLUMN IF EXISTS other_assessment_description1,
DROP COLUMN IF EXISTS other_assessment_date1,
DROP COLUMN IF EXISTS other_assessment_description2,
DROP COLUMN IF EXISTS other_assessment_date2,
DROP COLUMN IF EXISTS other_assessment_description3,
DROP COLUMN IF EXISTS other_assessment_date3,
DROP COLUMN IF EXISTS other_assessment_description4,
DROP COLUMN IF EXISTS other_assessment_date4,
DROP COLUMN IF EXISTS other_assessment_description5,
DROP COLUMN IF EXISTS other_assessment_date5;

----
-- Source: 20260817062935_drop_attachments_column_from_disaster_event_table.sql
----

ALTER TABLE disaster_event
DROP COLUMN IF EXISTS attachments;


----
-- Source: 20260817120000_migrate_recording_institution_to_organization.sql
----

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


----
-- Source: 20260819113000_drop_disaster_event_recording_institution.sql
----

ALTER TABLE disaster_event
DROP COLUMN IF EXISTS recording_institution;



----
-- Source: 20260827035820_update_version_no_to_0_3_0.sql
----

UPDATE dts_system_info
SET version_no = '0.3.0',
updated_at = NOW();