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