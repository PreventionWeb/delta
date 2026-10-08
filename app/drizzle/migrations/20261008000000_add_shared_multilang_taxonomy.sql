CREATE TABLE IF NOT EXISTS "language" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_name" text NOT NULL,
	"language_cd" text NOT NULL,
	CONSTRAINT "language_language_name_unique" UNIQUE ("language_name"),
	CONSTRAINT "language_language_cd_unique" UNIQUE ("language_cd"),
	CONSTRAINT "language_language_cd_length_check" CHECK (char_length("language_cd") = 2)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "text_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_text" text NOT NULL,
	"original_language_id" uuid NOT NULL,
	CONSTRAINT "text_content_original_language_id_fk" FOREIGN KEY ("original_language_id")
		REFERENCES "language"("id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "translation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text_content_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"translation" text NOT NULL,
	CONSTRAINT "translation_text_content_id_fk" FOREIGN KEY ("text_content_id")
		REFERENCES "text_content"("id") ON DELETE CASCADE,
	CONSTRAINT "translation_language_id_fk" FOREIGN KEY ("language_id")
		REFERENCES "language"("id"),
	CONSTRAINT "translation_text_content_id_language_id_unique" UNIQUE ("text_content_id", "language_id")
);
--> statement-breakpoint
INSERT INTO "language" ("language_name", "language_cd") VALUES
	('English', 'en'),
	('Arabic', 'ar'),
	('Russian', 'ru'),
	('French', 'fr'),
	('Spanish', 'es'),
	('Chinese', 'zh'),
	('Serbian', 'sr'),
	('Albanian', 'sq'),
	('Tajik', 'tg');
--> statement-breakpoint
ALTER TABLE "hazard_type" ADD COLUMN "name_text_content_id" uuid;
--> statement-breakpoint
UPDATE "hazard_type" SET "name_text_content_id" = gen_random_uuid();
--> statement-breakpoint
INSERT INTO "text_content" ("id", "original_text", "original_language_id")
	SELECT "name_text_content_id", "name", (SELECT "id" FROM "language" WHERE "language_cd" = 'en')
	FROM "hazard_type";
--> statement-breakpoint
INSERT INTO "translation" ("text_content_id", "language_id", "translation")
	SELECT tc."id", tc."original_language_id", tc."original_text"
	FROM "text_content" tc
	JOIN "hazard_type" ht ON ht."name_text_content_id" = tc."id";
--> statement-breakpoint
ALTER TABLE "hazard_type"
	ADD CONSTRAINT "hazard_type_name_text_content_id_fk"
	FOREIGN KEY ("name_text_content_id") REFERENCES "text_content"("id");
--> statement-breakpoint
ALTER TABLE "hazard_type" ALTER COLUMN "name_text_content_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "hazard_type" DROP COLUMN "name";
--> statement-breakpoint
ALTER TABLE "hazard_type" ADD COLUMN "source_ref_id" text;
--> statement-breakpoint
ALTER TABLE "hazard_type"
	ADD CONSTRAINT "hazard_type_source_ref_id_unique" UNIQUE ("source_ref_id");
--> statement-breakpoint
ALTER TABLE "hazard_cluster" ADD COLUMN "name_text_content_id" uuid;
--> statement-breakpoint
UPDATE "hazard_cluster" SET "name_text_content_id" = gen_random_uuid();
--> statement-breakpoint
INSERT INTO "text_content" ("id", "original_text", "original_language_id")
	SELECT "name_text_content_id", "name", (SELECT "id" FROM "language" WHERE "language_cd" = 'en')
	FROM "hazard_cluster";
--> statement-breakpoint
INSERT INTO "translation" ("text_content_id", "language_id", "translation")
	SELECT tc."id", tc."original_language_id", tc."original_text"
	FROM "text_content" tc
	JOIN "hazard_cluster" hc ON hc."name_text_content_id" = tc."id";
--> statement-breakpoint
ALTER TABLE "hazard_cluster"
	ADD CONSTRAINT "hazard_cluster_name_text_content_id_fk"
	FOREIGN KEY ("name_text_content_id") REFERENCES "text_content"("id");
--> statement-breakpoint
ALTER TABLE "hazard_cluster" ALTER COLUMN "name_text_content_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "hazard_cluster" DROP COLUMN "name";
--> statement-breakpoint
ALTER TABLE "hazard_cluster" ADD COLUMN "source_ref_id" text;
--> statement-breakpoint
ALTER TABLE "hazard_cluster"
	ADD CONSTRAINT "hazard_cluster_source_ref_id_unique" UNIQUE ("source_ref_id");
--> statement-breakpoint
ALTER TABLE "specific_hazard" ADD COLUMN "name_text_content_id" uuid;
--> statement-breakpoint
UPDATE "specific_hazard" SET "name_text_content_id" = gen_random_uuid();
--> statement-breakpoint
INSERT INTO "text_content" ("id", "original_text", "original_language_id")
	SELECT "name_text_content_id", "name", (SELECT "id" FROM "language" WHERE "language_cd" = 'en')
	FROM "specific_hazard";
--> statement-breakpoint
INSERT INTO "translation" ("text_content_id", "language_id", "translation")
	SELECT tc."id", tc."original_language_id", tc."original_text"
	FROM "text_content" tc
	JOIN "specific_hazard" sh ON sh."name_text_content_id" = tc."id";
--> statement-breakpoint
ALTER TABLE "specific_hazard"
	ADD CONSTRAINT "specific_hazard_name_text_content_id_fk"
	FOREIGN KEY ("name_text_content_id") REFERENCES "text_content"("id");
--> statement-breakpoint
ALTER TABLE "specific_hazard" ALTER COLUMN "name_text_content_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "specific_hazard" DROP COLUMN "name";
--> statement-breakpoint
ALTER TABLE "specific_hazard" ADD COLUMN "description_text_content_id" uuid;
--> statement-breakpoint
ALTER TABLE "specific_hazard"
	ADD CONSTRAINT "specific_hazard_description_text_content_id_fk"
	FOREIGN KEY ("description_text_content_id") REFERENCES "text_content"("id");
--> statement-breakpoint
ALTER TABLE "specific_hazard" ADD COLUMN "source_ref_id" text;
--> statement-breakpoint
ALTER TABLE "specific_hazard"
	ADD CONSTRAINT "specific_hazard_source_ref_id_unique" UNIQUE ("source_ref_id");
