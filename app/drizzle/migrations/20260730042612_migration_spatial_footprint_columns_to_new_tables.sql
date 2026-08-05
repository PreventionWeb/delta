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