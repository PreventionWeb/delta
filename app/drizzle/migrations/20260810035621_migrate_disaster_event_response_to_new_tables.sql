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