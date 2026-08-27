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