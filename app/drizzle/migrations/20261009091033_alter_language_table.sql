BEGIN;

-- Preserve existing language codes and their UUIDs.
ALTER TABLE public.language
RENAME COLUMN language_name TO language_cd;

-- PostgreSQL text has no length limit; varchar(2) allows up to 2 characters.
ALTER TABLE public.language
ALTER COLUMN language_cd TYPE varchar(2);

-- Require exactly two characters.
ALTER TABLE public.language ADD CONSTRAINT language_cd_length_check CHECK (char_length(language_cd) = 2);

-- The existing NOT NULL and UNIQUE constraints survive the rename.
ALTER TABLE public.language RENAME CONSTRAINT language_language_name_key TO language_language_cd_key;

-- Add the readable name, initially nullable so existing rows can be populated.
ALTER TABLE public.language
ADD COLUMN language_name text;

UPDATE public.language
SET
    language_name = CASE language_cd
        WHEN 'ar' THEN 'Arabic'
        WHEN 'en' THEN 'English'
        WHEN 'es' THEN 'Spanish'
        WHEN 'fr' THEN 'French'
        WHEN 'ru' THEN 'Russian'
        WHEN 'sq' THEN 'Albanian'
        WHEN 'sr' THEN 'Serbian'
        WHEN 'zh' THEN 'Chinese'
        WHEN 'tg' THEN 'Tajik'
    END;

-- Unknown codes remain NULL and prevent this migration from committing.
ALTER TABLE public.language
ALTER COLUMN language_name
SET
    NOT NULL;

ALTER TABLE public.language ADD CONSTRAINT language_language_name_key UNIQUE (language_name);

COMMIT;