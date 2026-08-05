-- ADR-008 / design.md Decision 18: Notices content is single-locale, not a locale-map.
-- Zero real data in this synthetic pilot domain, so no backfill is needed.
ALTER TABLE "notices" DROP COLUMN "title_json";
ALTER TABLE "notices" DROP COLUMN "body_json";
ALTER TABLE "notices" ADD COLUMN "title" text NOT NULL;
ALTER TABLE "notices" ADD COLUMN "body" text;
ALTER TABLE "notices" ADD COLUMN "locale" text NOT NULL;
