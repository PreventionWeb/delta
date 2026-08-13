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