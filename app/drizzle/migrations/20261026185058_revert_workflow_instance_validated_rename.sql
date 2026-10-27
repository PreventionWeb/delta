BEGIN;

-- Reverts 20261015100122_migrate_validation_workflow.sql's validated_*->rejected_* rename --
-- deviated from the ER diagram and the already-shipped validate()/approve() domain split.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'workflow_instance'
			AND column_name = 'rejected_at'
	) AND NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'workflow_instance'
			AND column_name = 'validated_at'
	) THEN
		ALTER TABLE public.workflow_instance
			RENAME COLUMN rejected_at TO validated_at;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'workflow_instance'
			AND column_name = 'rejected_by_user_id'
	) AND NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'workflow_instance'
			AND column_name = 'validated_by_user_id'
	) THEN
		ALTER TABLE public.workflow_instance
			RENAME COLUMN rejected_by_user_id TO validated_by_user_id;
	END IF;
END $$;

COMMIT;
