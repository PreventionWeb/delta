BEGIN;

-- 1) Rename workflow_instance validated columns for rejection semantics
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'workflow_instance'
			AND column_name = 'validated_at'
	) AND NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'workflow_instance'
			AND column_name = 'rejected_at'
	) THEN
		ALTER TABLE public.workflow_instance
			RENAME COLUMN validated_at TO rejected_at;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'workflow_instance'
			AND column_name = 'validated_by_user_id'
	) AND NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'workflow_instance'
			AND column_name = 'rejected_by_user_id'
	) THEN
		ALTER TABLE public.workflow_instance
			RENAME COLUMN validated_by_user_id TO rejected_by_user_id;
	END IF;
END $$;

-- 2) Ensure one workflow_instance per hazardous_event and map approval statuses
WITH latest_rejection AS (
	SELECT DISTINCT ON (evr.entity_id)
		evr.entity_id,
		evr.rejected_by_user_id,
		evr.rejected_at
	FROM public.entity_validation_rejection evr
	WHERE evr.entity_type = 'hazardous_event'
	ORDER BY evr.entity_id, evr.rejected_at DESC, evr.id DESC
),
source_rows AS (
	SELECT
		he.id AS entity_id,
		'HE'::text AS entity_type,
		CASE he."approvalStatus"
			WHEN 'draft' THEN 'DRAFT'
			WHEN 'waiting-for-validation' THEN 'SUBMITTED'
			WHEN 'validated' THEN 'APPROVED'
			WHEN 'needs-revision' THEN 'REVISION_REQUESTED'
			WHEN 'published' THEN 'PUBLISHED'
			ELSE 'DRAFT'
		END AS status,
		he.submitted_by_user_id,
		he.submitted_at::timestamptz AS submitted_at,
		he.validated_by_user_id AS approved_by_user_id,
		he.validated_at::timestamptz AS approved_at,
		lr.rejected_by_user_id,
		lr.rejected_at::timestamptz AS rejected_at,
		he.published_by_user_id,
		he.published_at::timestamptz AS published_at,
		COALESCE(he.created_at::timestamptz, CURRENT_TIMESTAMP) AS created_at,
		COALESCE(he.updated_at::timestamptz, CURRENT_TIMESTAMP) AS updated_at
	FROM public.hazardous_event he
	LEFT JOIN latest_rejection lr
		ON lr.entity_id = he.id
)
INSERT INTO public.workflow_instance (
	entity_id,
	entity_type,
	status,
	submitted_by_user_id,
	submitted_at,
	rejected_by_user_id,
	rejected_at,
	approved_by_user_id,
	approved_at,
	published_by_user_id,
	published_at,
	created_at,
	updated_at
)
SELECT
	sr.entity_id,
	sr.entity_type,
	sr.status,
	sr.submitted_by_user_id,
	sr.submitted_at,
	sr.rejected_by_user_id,
	sr.rejected_at,
	CASE
		WHEN sr.status IN ('APPROVED', 'PUBLISHED')
			THEN COALESCE(sr.approved_by_user_id, sr.published_by_user_id)
		ELSE NULL
	END AS approved_by_user_id,
	CASE
		WHEN sr.status IN ('APPROVED', 'PUBLISHED')
			THEN sr.approved_at
		ELSE NULL
	END AS approved_at,
	sr.published_by_user_id,
	sr.published_at,
	sr.created_at,
	sr.updated_at
FROM source_rows sr
ON CONFLICT (entity_id, entity_type) DO UPDATE
SET
	status = EXCLUDED.status,
	submitted_by_user_id = EXCLUDED.submitted_by_user_id,
	submitted_at = EXCLUDED.submitted_at,
	rejected_by_user_id = EXCLUDED.rejected_by_user_id,
	rejected_at = EXCLUDED.rejected_at,
	approved_by_user_id = EXCLUDED.approved_by_user_id,
	approved_at = EXCLUDED.approved_at,
	published_by_user_id = EXCLUDED.published_by_user_id,
	published_at = EXCLUDED.published_at,
	updated_at = EXCLUDED.updated_at;

-- 3) workflow_notification for "waiting-for-validation" via entity_validation_assignment
INSERT INTO public.workflow_notification (
	instance_id,
	notified_user_id,
	notified_by_user_id,
	notified_at,
	notification_message,
	channel
)
SELECT
	wi.id AS instance_id,
	eva.assigned_to_user_id AS notified_user_id,
	eva.assigned_by_user_id AS notified_by_user_id,
	eva.assigned_at::timestamptz AS notified_at,
	'Validation requested for hazardous event'::text AS notification_message,
	'workflow'::text AS channel
FROM public.hazardous_event he
JOIN public.workflow_instance wi
	ON wi.entity_id = he.id
	AND wi.entity_type = 'HE'
JOIN public.entity_validation_assignment eva
	ON eva.entity_id = he.id
	AND eva.entity_type = 'hazardous_event'
WHERE he."approvalStatus" = 'waiting-for-validation'
	AND NOT EXISTS (
		SELECT 1
		FROM public.workflow_notification wn
		WHERE wn.instance_id = wi.id
			AND wn.notified_user_id = eva.assigned_to_user_id
			AND wn.notified_by_user_id IS NOT DISTINCT FROM eva.assigned_by_user_id
			AND wn.notified_at IS NOT DISTINCT FROM eva.assigned_at::timestamptz
			AND wn.notification_message = 'Validation requested for hazardous event'
			AND wn.channel = 'workflow'
	);

-- 4) workflow_notification for "needs-revision" via entity_validation_rejection
INSERT INTO public.workflow_notification (
	instance_id,
	notified_user_id,
	notified_by_user_id,
	notified_at,
	notification_message,
	channel
)
SELECT
	wi.id AS instance_id,
	COALESCE(wi.submitted_by_user_id, evr.rejected_by_user_id) AS notified_user_id,
	evr.rejected_by_user_id AS notified_by_user_id,
	evr.rejected_at::timestamptz AS notified_at,
	COALESCE(NULLIF(evr.rejection_message, ''), 'Revision requested for hazardous event') AS notification_message,
	'workflow'::text AS channel
FROM public.hazardous_event he
JOIN public.workflow_instance wi
	ON wi.entity_id = he.id
	AND wi.entity_type = 'HE'
JOIN public.entity_validation_rejection evr
	ON evr.entity_id = he.id
	AND evr.entity_type = 'hazardous_event'
WHERE he."approvalStatus" = 'needs-revision'
	AND COALESCE(wi.submitted_by_user_id, evr.rejected_by_user_id) IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM public.workflow_notification wn
		WHERE wn.instance_id = wi.id
			AND wn.notified_user_id = COALESCE(wi.submitted_by_user_id, evr.rejected_by_user_id)
			AND wn.notified_by_user_id IS NOT DISTINCT FROM evr.rejected_by_user_id
			AND wn.notified_at IS NOT DISTINCT FROM evr.rejected_at::timestamptz
			AND wn.notification_message IS NOT DISTINCT FROM COALESCE(NULLIF(evr.rejection_message, ''), 'Revision requested for hazardous event')
			AND wn.channel = 'workflow'
	);

-- 5) workflow_history bootstrap + inferred status transitions
WITH fallback_user AS (
	SELECT u.id AS user_id
	FROM public."user" u
	ORDER BY u.id
	LIMIT 1
),
latest_rejection AS (
	SELECT DISTINCT ON (evr.entity_id)
		evr.entity_id,
		evr.rejected_by_user_id,
		evr.rejected_at::timestamptz AS rejected_at
	FROM public.entity_validation_rejection evr
	WHERE evr.entity_type = 'hazardous_event'
	ORDER BY evr.entity_id, evr.rejected_at DESC, evr.id DESC
),
base AS (
	SELECT
		he.id AS entity_id,
		wi.id AS instance_id,
		he."approvalStatus" AS approval_status,
		COALESCE(he.created_at::timestamptz, CURRENT_TIMESTAMP) AS created_at,
		he.created_by_user_id,
		he.updated_by_user_id,
		he.submitted_by_user_id,
		he.submitted_at::timestamptz AS submitted_at,
		he.validated_by_user_id,
		he.validated_at::timestamptz AS approved_at,
		he.published_by_user_id,
		he.published_at::timestamptz AS published_at,
		lr.rejected_by_user_id,
		lr.rejected_at
	FROM public.hazardous_event he
	JOIN public.workflow_instance wi
		ON wi.entity_id = he.id
		AND wi.entity_type = 'HE'
	LEFT JOIN latest_rejection lr
		ON lr.entity_id = he.id
),
events AS (
	-- Initial creation state
	SELECT
		b.instance_id,
		NULL::text AS from_status,
		'DRAFT'::text AS to_status,
		COALESCE(
			b.created_by_user_id,
			b.updated_by_user_id,
			b.submitted_by_user_id,
			b.validated_by_user_id,
			b.published_by_user_id,
			b.rejected_by_user_id,
			fu.user_id
		) AS acting_user_id,
		b.created_at AS occurred_at
	FROM base b
	CROSS JOIN fallback_user fu

	UNION ALL

	-- Submitted state
	SELECT
		b.instance_id,
		'DRAFT'::text AS from_status,
		'SUBMITTED'::text AS to_status,
		COALESCE(b.submitted_by_user_id, b.updated_by_user_id, b.created_by_user_id, fu.user_id) AS acting_user_id,
		COALESCE(b.submitted_at, b.created_at) AS occurred_at
	FROM base b
	CROSS JOIN fallback_user fu
	WHERE b.approval_status IN (
		'waiting-for-validation',
		'needs-revision',
		'validated',
		'published'
	)

	UNION ALL

	-- Revision requested state
	SELECT
		b.instance_id,
		'SUBMITTED'::text AS from_status,
		'REVISION_REQUESTED'::text AS to_status,
		COALESCE(b.rejected_by_user_id, b.updated_by_user_id, b.created_by_user_id, fu.user_id) AS acting_user_id,
		COALESCE(b.rejected_at, b.updated_at::timestamptz, b.created_at) AS occurred_at
	FROM (
		SELECT
			base.*,
			he2.updated_at
		FROM base
		JOIN public.hazardous_event he2
			ON he2.id = base.entity_id
	) b
	CROSS JOIN fallback_user fu
	WHERE b.approval_status = 'needs-revision'

	UNION ALL

	-- Approved state
	SELECT
		b.instance_id,
		'SUBMITTED'::text AS from_status,
		'APPROVED'::text AS to_status,
		COALESCE(b.validated_by_user_id, b.updated_by_user_id, b.created_by_user_id, fu.user_id) AS acting_user_id,
		COALESCE(b.approved_at, b.updated_at::timestamptz, b.created_at) AS occurred_at
	FROM (
		SELECT
			base.*,
			he2.updated_at
		FROM base
		JOIN public.hazardous_event he2
			ON he2.id = base.entity_id
	) b
	CROSS JOIN fallback_user fu
	WHERE b.approval_status IN ('validated', 'published')

	UNION ALL

	-- Published state
	SELECT
		b.instance_id,
		'APPROVED'::text AS from_status,
		'PUBLISHED'::text AS to_status,
		COALESCE(b.published_by_user_id, b.validated_by_user_id, b.updated_by_user_id, b.created_by_user_id, fu.user_id) AS acting_user_id,
		COALESCE(b.published_at, b.updated_at::timestamptz, b.created_at) AS occurred_at
	FROM (
		SELECT
			base.*,
			he2.updated_at
		FROM base
		JOIN public.hazardous_event he2
			ON he2.id = base.entity_id
	) b
	CROSS JOIN fallback_user fu
	WHERE b.approval_status = 'published'
)
INSERT INTO public.workflow_history (
	instance_id,
	from_status,
	to_status,
	acting_user_id,
	occurred_at,
	comment
)
SELECT
	e.instance_id,
	e.from_status,
	e.to_status,
	e.acting_user_id,
	e.occurred_at,
	NULL::text AS comment
FROM events e
WHERE e.acting_user_id IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM public.workflow_history wh
		WHERE wh.instance_id = e.instance_id
			AND wh.from_status IS NOT DISTINCT FROM e.from_status
			AND wh.to_status = e.to_status
			AND wh.acting_user_id = e.acting_user_id
			AND wh.occurred_at IS NOT DISTINCT FROM e.occurred_at
	);

COMMIT;

-- ============================================================
-- Verification query: workflow history for one hazardous event
-- ============================================================
-- Replace the UUID below with the hazardous_event.id you want to inspect.
-- WITH target AS (
-- 	SELECT '00000000-0000-0000-0000-000000000000'::uuid AS hazardous_event_id
-- )
-- SELECT
-- 	he.id AS hazardous_event_id,
-- 	he."approvalStatus" AS hazardous_event_approval_status,
-- 	wi.id AS workflow_instance_id,
-- 	wi.status AS workflow_current_status,
-- 	wh.id AS workflow_history_id,
-- 	wh.from_status,
-- 	wh.to_status,
-- 	wh.occurred_at,
-- 	wh.acting_user_id,
-- 	u.email AS acting_user_email,
-- 	wh.comment
-- FROM target t
-- JOIN public.hazardous_event he
-- 	ON he.id = t.hazardous_event_id
-- LEFT JOIN public.workflow_instance wi
-- 	ON wi.entity_id = he.id
-- 	AND wi.entity_type = 'HE'
-- LEFT JOIN public.workflow_history wh
-- 	ON wh.instance_id = wi.id
-- LEFT JOIN public."user" u
-- 	ON u.id = wh.acting_user_id
-- ORDER BY
-- 	wh.occurred_at NULLS LAST,
-- 	wh.id;