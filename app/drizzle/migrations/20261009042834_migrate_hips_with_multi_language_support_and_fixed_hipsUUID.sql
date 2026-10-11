-- PostgreSQL 16: migrate the three legacy HIPs tables into the diagram's schema.
-- Run against a backup/test database first, with application writes paused.
-- This is a ONE-TIME migration: existing target HIPs tables are dropped and rebuilt.
-- WARNING: existing data in these four target tables will be deleted on commit.
-- Legacy tables remain intact. The hazardous_event FK is temporarily removed.
-- Existing language/text_content/translation tables must match the diagram.
-- On any error, issue ROLLBACK if your SQL client leaves the transaction open.

BEGIN;
SET LOCAL search_path = public, pg_catalog;

-- 0a. Save the hazardous_event FK definition. All hazard references must be NULL.
-- Prevent event writes while the FK is removed and the target is rebuilt.
LOCK TABLE public.hazardous_event IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.specific_hazard IN SHARE MODE;
CREATE TEMP TABLE _hips_saved_fk ON COMMIT DROP AS
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.hazardous_event'::regclass
  AND confrelid = 'public.specific_hazard'::regclass
  AND contype = 'f'
  AND conname = 'hazardous_event_specific_hazard_id_specific_hazard_id_fk';
DO $$
BEGIN
    IF (SELECT count(*) FROM _hips_saved_fk) <> 1 THEN
        RAISE EXCEPTION 'Expected hazardous_event_specific_hazard_id_specific_hazard_id_fk was not found.';
    END IF;
END $$;
-- Verify the stated prerequisite; do not change any event data.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.hazardous_event WHERE specific_hazard_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Expected all hazardous_event.specific_hazard_id values to be NULL.';
    END IF;
END $$;
ALTER TABLE public.hazardous_event
DROP CONSTRAINT hazardous_event_specific_hazard_id_specific_hazard_id_fk;

-- 0b. Save and temporarily remove the two hazard-type definition FKs.
LOCK TABLE public.hazard_type_custom_field_definition,
           public.hazard_type_field_definition IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE _hips_saved_type_fks ON COMMIT DROP AS
SELECT c.conname, c.conrelid::regclass::text AS table_name,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.confrelid = 'public.hazard_type'::regclass
  AND (
      (c.conrelid = 'public.hazard_type_custom_field_definition'::regclass
       AND c.conname = 'hazard_type_custom_field_definition_hazard_type_id_fk')
      OR
      (c.conrelid = 'public.hazard_type_field_definition'::regclass
       AND c.conname = 'hazard_type_field_definition_hazard_type_id_fk')
  );
DO $$
DECLARE fk record;
BEGIN
    IF (SELECT count(*) FROM _hips_saved_type_fks) <> 2 THEN
        RAISE EXCEPTION 'Expected both hazard-type definition foreign keys to exist.';
    END IF;
    FOR fk IN SELECT * FROM _hips_saved_type_fks LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.table_name, fk.conname);
    END LOOP;
END $$;

-- 0. Remove the previous target schema, children before parents.
-- The legacy hip_class, hip_cluster, and hip_hazard tables are preserved.
-- No CASCADE: external foreign keys/views block these drops and require review.
-- These transactional drops are undone if the migration is rolled back.
DROP TABLE IF EXISTS public.specific_hazard;
DROP TABLE IF EXISTS public.hazard_cluster;
DROP TABLE IF EXISTS public.hazard_type;
DROP TABLE IF EXISTS public.hips_version;

-- 1. Configure the edition represented by the legacy data. Change if necessary.
CREATE TEMP TABLE _hips_settings ON COMMIT DROP AS
SELECT '2025'::text AS version_no;

-- Keep the source stable for the duration of the migration.
LOCK TABLE public.hip_class, public.hip_cluster, public.hip_hazard IN SHARE MODE;

-- 2. Create shared multilingual tables if they do not already exist.
-- language_name holds ISO codes such as en and ar.
CREATE TABLE IF NOT EXISTS public.language (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    language_name text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS public.text_content (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    original_text text NOT NULL,
    original_language_id uuid REFERENCES public.language(id)
);
CREATE TABLE IF NOT EXISTS public.translation (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    text_content_id uuid REFERENCES public.text_content(id),
    language_id uuid REFERENCES public.language(id),
    translation text NOT NULL
);
-- Enforce one translation per text/language pair. Existing duplicate pairs
-- cause an error instead of silently discarding data.
CREATE UNIQUE INDEX IF NOT EXISTS translation_text_language_uq
    ON public.translation (text_content_id, language_id);

-- 3. Create the new HIPs hierarchy and indexes.
-- Recreate the target tables after removing the previous schema in step 0.
CREATE TABLE IF NOT EXISTS public.hips_version (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_no text NOT NULL UNIQUE
);
CREATE TABLE public.hazard_type (
    id uuid PRIMARY KEY,
    name_text_content_id uuid REFERENCES public.text_content(id),
    hip_version_id uuid REFERENCES public.hips_version(id),
    source_ref_id text UNIQUE
);
CREATE TABLE public.hazard_cluster (
    id uuid PRIMARY KEY,
    name_text_content_id uuid REFERENCES public.text_content(id),
    hazard_type_id uuid REFERENCES public.hazard_type(id),
    source_ref_id text UNIQUE
);
CREATE TABLE public.specific_hazard (
    id uuid PRIMARY KEY,
    name_text_content_id uuid REFERENCES public.text_content(id),
    code text NOT NULL,
    hazard_cluster_id uuid REFERENCES public.hazard_cluster(id),
    source_ref_id text UNIQUE,
    description_text_content_id uuid REFERENCES public.text_content(id)
);
CREATE INDEX hazard_type_version_idx ON public.hazard_type(hip_version_id);
CREATE INDEX hazard_cluster_type_idx ON public.hazard_cluster(hazard_type_id);
CREATE INDEX specific_hazard_cluster_idx ON public.specific_hazard(hazard_cluster_id);

-- 4. Insert the eight ISO codes, preserving existing code rows and UUIDs.
INSERT INTO public.language(language_name)
VALUES ('ar'), ('en'), ('es'), ('fr'), ('ru'), ('sq'), ('sr'), ('zh'), ('tg')
ON CONFLICT (language_name) DO NOTHING;

CREATE TEMP TABLE _hips_languages ON COMMIT DROP AS
SELECT language_name AS code, id AS language_id
FROM public.language
WHERE language_name IN ('ar', 'en', 'es', 'fr', 'ru', 'sq', 'sr', 'zh', 'tg');
ALTER TABLE _hips_languages ADD PRIMARY KEY(code);

-- 5. Assign FIXED UUIDs, identical across instances and repeat executions.
-- Formula: md5('delta:hips:' || version || ':' || target_table || ':' || legacy_id)::uuid
-- PostgreSQL accepts the 32 hexadecimal digits as a UUID; no extension is needed.
-- This is a deterministic hash-based UUID, not a randomly generated UUID.
-- The table component separates IDs shared by different legacy tables.
-- Keep this formula/prefix unchanged in every instance. Matching legacy IDs and
-- HIPs editions must identify the same canonical records across instances.
-- Do not use row numbers or insertion order: those may differ across instances.
-- Translation/text_content UUIDs remain local and are not consolidation keys.
CREATE TEMP TABLE _hips_entities ON COMMIT DROP AS
SELECT 'type'::text AS kind, id AS source_ref_id, NULL::text AS parent_ref,
       NULL::text AS code, name_en, name AS names,
       NULL::text AS description_en, NULL::jsonb AS descriptions,
       md5('delta:hips:' || (SELECT version_no FROM _hips_settings) || ':hazard_type:' || id)::uuid AS new_id
FROM public.hip_class
UNION ALL
SELECT 'cluster', id, type_id, NULL::text, name_en, name,
       NULL::text, NULL::jsonb,
       md5('delta:hips:' || (SELECT version_no FROM _hips_settings) || ':hazard_cluster:' || id)::uuid
FROM public.hip_cluster
UNION ALL
SELECT 'hazard', id, cluster_id, code, name_en, name,
       description_en, description,
       md5('delta:hips:' || (SELECT version_no FROM _hips_settings) || ':specific_hazard:' || id)::uuid
FROM public.hip_hazard;
ALTER TABLE _hips_entities ADD PRIMARY KEY(kind, source_ref_id);
-- Enforce uniqueness of the generated fixed UUIDs across all three tables.
ALTER TABLE _hips_entities ADD UNIQUE(new_id);

-- Confirm the expected 2025 source dataset: 8 types, 38 clusters, 281 hazards.
DO $$
BEGIN
    IF (SELECT count(*) FROM _hips_entities WHERE kind = 'type') <> 8
       OR (SELECT count(*) FROM _hips_entities WHERE kind = 'cluster') <> 38
       OR (SELECT count(*) FROM _hips_entities WHERE kind = 'hazard') <> 281 THEN
        RAISE EXCEPTION 'Expected 8 hazard types, 38 clusters, and 281 specific hazards. Check source data.';
    END IF;
END $$;

-- Check references and required data before creating text records.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM _hips_entities e
        WHERE e.kind IN ('cluster', 'hazard') AND NOT EXISTS (
            SELECT 1 FROM _hips_entities p
            WHERE p.kind = CASE e.kind WHEN 'cluster' THEN 'type' ELSE 'cluster' END
              AND p.source_ref_id = e.parent_ref
        )
    ) THEN
        RAISE EXCEPTION 'Missing legacy parent: check hip_cluster.type_id and hip_hazard.cluster_id.';
    END IF;
    IF EXISTS (SELECT 1 FROM _hips_entities WHERE kind = 'hazard' AND code IS NULL) THEN
        RAISE EXCEPTION 'A legacy hazard has NULL code; the new schema requires code.';
    END IF;
END $$;

-- 6. Stage names for every entity and descriptions for hazards that have them.
-- English originals come exclusively from the JSONB en value.
-- name_en/description_en are not used as fallback.
-- A completely absent hazard description produces a NULL description FK.
CREATE TEMP TABLE _hips_texts ON COMMIT DROP AS
SELECT kind, source_ref_id, 'name'::text AS field,
       name_en AS fallback_en, names AS translations,
       gen_random_uuid() AS text_id
FROM _hips_entities
UNION ALL
SELECT kind, source_ref_id, 'description', description_en, descriptions,
       gen_random_uuid()
FROM _hips_entities
WHERE kind = 'hazard'
  AND (nullif(btrim(description_en), '') IS NOT NULL
       OR (descriptions IS NOT NULL AND descriptions NOT IN ('{}'::jsonb, 'null'::jsonb)));
ALTER TABLE _hips_texts ADD PRIMARY KEY(kind, source_ref_id, field);

-- Reject malformed JSON, unknown languages, or non-string translations.
-- NULL/blank JSON values are skipped; they are not usable translated text.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM _hips_texts
        WHERE translations IS NOT NULL
          AND jsonb_typeof(translations) NOT IN ('object', 'null')
    ) THEN
        RAISE EXCEPTION 'Legacy name/description JSON must be an object.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM _hips_texts t
        CROSS JOIN LATERAL jsonb_each(
            CASE WHEN jsonb_typeof(t.translations) = 'object'
                 THEN t.translations ELSE '{}'::jsonb END
        ) j
        WHERE (jsonb_typeof(j.value) NOT IN ('string', 'null'))
           OR NOT EXISTS (SELECT 1 FROM _hips_languages l WHERE l.code = j.key)
    ) THEN
        RAISE EXCEPTION 'Unknown language key or non-string translation: inspect legacy JSON.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM _hips_texts
        WHERE nullif(btrim(translations->>'en'), '') IS NULL
    ) THEN
        RAISE EXCEPTION 'A name/description has no usable JSONB en value; no English-column fallback is used.';
    END IF;
END $$;

-- 7. Insert English originals, then translations into other languages.
-- original_language_id is the UUID of language_name = en.
-- The original language is stored only in text_content, not in translation.
-- Stored text is not trimmed.
INSERT INTO public.text_content(id, original_text, original_language_id)
SELECT t.text_id,
       t.translations->>'en',
       l.language_id
FROM _hips_texts t
JOIN _hips_languages l ON l.code = 'en';

INSERT INTO public.translation(text_content_id, language_id, translation)
SELECT t.text_id, l.language_id, j.value
FROM _hips_texts t
CROSS JOIN LATERAL jsonb_each_text(
    CASE WHEN jsonb_typeof(t.translations) = 'object'
         THEN t.translations ELSE '{}'::jsonb END
) j
JOIN _hips_languages l ON l.code = j.key
JOIN public.text_content tc ON tc.id = t.text_id
WHERE nullif(btrim(j.value), '') IS NOT NULL
  AND l.language_id <> tc.original_language_id;

-- 8. Insert parents before children, resolving relationships by legacy IDs.
INSERT INTO public.hips_version(version_no)
SELECT s.version_no FROM _hips_settings s
WHERE NOT EXISTS (
    SELECT 1 FROM public.hips_version v WHERE v.version_no::text = s.version_no
);
-- Require exactly one matching version, including when it already existed.
DO $$
BEGIN
    IF (SELECT count(*) FROM public.hips_version v
        JOIN _hips_settings s ON v.version_no::text = s.version_no) <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one HIPs version matching the configured edition.';
    END IF;
END $$;

INSERT INTO public.hazard_type(id, name_text_content_id, hip_version_id, source_ref_id)
SELECT e.new_id, t.text_id, v.id, e.source_ref_id
FROM _hips_entities e
JOIN _hips_texts t USING(kind, source_ref_id)
JOIN public.hips_version v ON v.version_no::text = (SELECT version_no FROM _hips_settings)
WHERE e.kind = 'type' AND t.field = 'name';

INSERT INTO public.hazard_cluster(id, name_text_content_id, hazard_type_id, source_ref_id)
SELECT e.new_id, t.text_id, p.new_id, e.source_ref_id
FROM _hips_entities e
JOIN _hips_texts t USING(kind, source_ref_id)
JOIN _hips_entities p ON p.kind = 'type' AND p.source_ref_id = e.parent_ref
WHERE e.kind = 'cluster' AND t.field = 'name';

INSERT INTO public.specific_hazard(
    id, name_text_content_id, code, hazard_cluster_id,
    source_ref_id, description_text_content_id
)
SELECT e.new_id, n.text_id, e.code, p.new_id, e.source_ref_id, d.text_id
FROM _hips_entities e
JOIN _hips_texts n ON n.kind = e.kind AND n.source_ref_id = e.source_ref_id AND n.field = 'name'
JOIN _hips_entities p ON p.kind = 'cluster' AND p.source_ref_id = e.parent_ref
LEFT JOIN _hips_texts d ON d.kind = e.kind AND d.source_ref_id = e.source_ref_id AND d.field = 'description'
WHERE e.kind = 'hazard';

-- 8a. Restore the event FK after rebuilding specific_hazard.
-- No hazardous_event data updates are needed: references were checked as NULL.
-- Restore the original FK, including its ON DELETE/UPDATE and deferrability.
DO $$
DECLARE fk record;
BEGIN
    SELECT * INTO STRICT fk FROM _hips_saved_fk;
    EXECUTE format('ALTER TABLE public.hazardous_event ADD CONSTRAINT %I %s',
                   fk.conname, fk.definition);
    EXECUTE format('ALTER TABLE public.hazardous_event VALIDATE CONSTRAINT %I', fk.conname);
END $$;

-- 8b. Restore both hazard-type definition FKs with their original settings.
-- Definition-table data is unchanged. Validation catches references to old UUIDs.
-- If validation fails, ROLLBACK restores the previous tables and constraints.
DO $$
DECLARE fk record;
BEGIN
    FOR fk IN SELECT * FROM _hips_saved_type_fks LOOP
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',
                       fk.table_name, fk.conname, fk.definition);
        EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I',
                       fk.table_name, fk.conname);
    END LOOP;
END $$;

-- 9. Abort rather than commit a migration with missing entities or text rows.
DO $$
BEGIN
    IF (SELECT count(*) FROM public.hazard_type) <> (SELECT count(*) FROM public.hip_class)
       OR (SELECT count(*) FROM public.hazard_cluster) <> (SELECT count(*) FROM public.hip_cluster)
       OR (SELECT count(*) FROM public.specific_hazard) <> (SELECT count(*) FROM public.hip_hazard)
       OR (SELECT count(*) FROM _hips_texts) <> (
           SELECT count(*) FROM _hips_texts t JOIN public.text_content tc ON tc.id = t.text_id
       ) THEN
        RAISE EXCEPTION 'Migration validation failed: source/target counts differ.';
    END IF;
END $$;

-- Review counts in your client's results. For a dry run, change COMMIT to ROLLBACK.
SELECT 'hazard_type' AS target, (SELECT count(*) FROM public.hip_class) AS source_count,
       count(*) AS migrated_count FROM public.hazard_type
UNION ALL
SELECT 'hazard_cluster', (SELECT count(*) FROM public.hip_cluster), count(*) FROM public.hazard_cluster
UNION ALL
SELECT 'specific_hazard', (SELECT count(*) FROM public.hip_hazard), count(*) FROM public.specific_hazard;

COMMIT;

-- Optional inspection after commit:
-- SELECT ht.source_ref_id, tc.original_text, l.language_name, tr.translation
-- FROM public.hazard_type ht
-- JOIN public.text_content tc ON tc.id = ht.name_text_content_id
-- JOIN public.translation tr ON tr.text_content_id = tc.id
-- JOIN public.language l ON l.id = tr.language_id
-- ORDER BY ht.source_ref_id, l.language_name;

-- Example to get specific hazard names in Arabic
-- SELECT sh.*, t.translation AS name_ar
-- FROM public.specific_hazard AS sh
-- JOIN public.translation AS t
--     ON t.text_content_id = sh.name_text_content_id
-- JOIN public.language AS l
--     ON l.id = t.language_id
-- WHERE l.language_name = 'ar'
--   AND t.translation LIKE '%حمى%';
