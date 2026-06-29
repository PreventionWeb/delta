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