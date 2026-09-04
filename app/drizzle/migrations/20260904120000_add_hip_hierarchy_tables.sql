CREATE TABLE IF NOT EXISTS "hips_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_no" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "hazard_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hips_version_id" uuid NOT NULL,
	CONSTRAINT "hazard_type_hips_version_id_fk" FOREIGN KEY ("hips_version_id")
		REFERENCES "hips_version"("id")
);

CREATE TABLE IF NOT EXISTS "hazard_cluster" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hazard_type_id" uuid NOT NULL,
	CONSTRAINT "hazard_cluster_hazard_type_id_fk" FOREIGN KEY ("hazard_type_id")
		REFERENCES "hazard_type"("id")
);

CREATE TABLE IF NOT EXISTS "specific_hazard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"hazard_cluster_id" uuid NOT NULL,
	CONSTRAINT "specific_hazard_hazard_cluster_id_fk" FOREIGN KEY ("hazard_cluster_id")
		REFERENCES "hazard_cluster"("id")
);
