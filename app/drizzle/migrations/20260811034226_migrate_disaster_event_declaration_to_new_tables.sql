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
            time zone NOT NULL,
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