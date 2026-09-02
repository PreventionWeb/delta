CREATE TABLE IF NOT EXISTS "workflow_instance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp with time zone,
	"validated_by_user_id" uuid,
	"validated_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "workflow_instance_entity_type_check" CHECK (entity_type IN ('HE', 'DE', 'DR')),
	CONSTRAINT "workflow_instance_status_check" CHECK (status IN ('DRAFT', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'PUBLISHED')),
	CONSTRAINT "workflow_instance_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by_user_id")
		REFERENCES "user"("id"),
	CONSTRAINT "workflow_instance_validated_by_user_id_fk" FOREIGN KEY ("validated_by_user_id")
		REFERENCES "user"("id"),
	CONSTRAINT "workflow_instance_approved_by_user_id_fk" FOREIGN KEY ("approved_by_user_id")
		REFERENCES "user"("id"),
	CONSTRAINT "workflow_instance_published_by_user_id_fk" FOREIGN KEY ("published_by_user_id")
		REFERENCES "user"("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_instance_entity_id_entity_type_unique"
	ON "workflow_instance" USING btree ("entity_id", "entity_type");

CREATE TABLE IF NOT EXISTS "workflow_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"acting_user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"comment" text,
	CONSTRAINT "workflow_history_to_status_check" CHECK (to_status IN ('DRAFT', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'PUBLISHED')),
	CONSTRAINT "workflow_history_from_status_check" CHECK (from_status IS NULL OR from_status IN ('DRAFT', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'PUBLISHED')),
	CONSTRAINT "workflow_history_instance_id_fk" FOREIGN KEY ("instance_id")
		REFERENCES "workflow_instance"("id")
		ON DELETE CASCADE,
	CONSTRAINT "workflow_history_acting_user_id_fk" FOREIGN KEY ("acting_user_id")
		REFERENCES "user"("id")
);

CREATE TABLE IF NOT EXISTS "workflow_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"notified_user_id" uuid NOT NULL,
	"notified_by_user_id" uuid,
	"notified_at" timestamp with time zone,
	"notification_message" text,
	"channel" text,
	CONSTRAINT "workflow_notification_instance_id_fk" FOREIGN KEY ("instance_id")
		REFERENCES "workflow_instance"("id")
		ON DELETE CASCADE,
	CONSTRAINT "workflow_notification_notified_user_id_fk" FOREIGN KEY ("notified_user_id")
		REFERENCES "user"("id"),
	CONSTRAINT "workflow_notification_notified_by_user_id_fk" FOREIGN KEY ("notified_by_user_id")
		REFERENCES "user"("id")
);
