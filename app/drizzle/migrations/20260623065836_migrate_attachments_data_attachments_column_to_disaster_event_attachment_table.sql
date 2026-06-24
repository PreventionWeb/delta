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

