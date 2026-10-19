import type { EntityType } from "~/domains/validation-workflow/domain/WorkflowInstance";

/** EntityType -> URL segment / display label (design.md Decision 9). */
export const ENTITY_TYPE_INFO: Record<
	EntityType,
	{ segment: string; label: string }
> = {
	HE: { segment: "hazardous-event", label: "hazardous event" },
	DE: { segment: "disaster-event", label: "disaster event" },
	DR: { segment: "disaster-record", label: "disaster record" },
};

/** Duplicated from emailValidationWorkflowService.ts's own (unexported) helper — exporting it
 * would mean touching a file outside this change's scope (tasks.md Task 6.2). */
export function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Takes an already-resolved publicUrl so this module stays pure (no configPublicUrl() call of
 * its own) — the adapter owns resolving that, consistent with gate 5's DIP finding. */
export function recordUrl(
	publicUrl: string,
	entityType: EntityType,
	entityId: string,
): string {
	// encodeURIComponent, not raw interpolation — entityId is expected to be a UUID but this
	// doesn't re-validate that; closes the one interpolation point gate 10's second-opinion
	// review found didn't follow this adapter's own "escape every interpolated value, no
	// exception" rule (design.md Decision 7).
	return `${publicUrl}/${ENTITY_TYPE_INFO[entityType].segment}/${encodeURIComponent(entityId)}`;
}

export interface EmailContent {
	subject: string;
	text: string;
	html: string;
}

/** Replicates emailAssignedValidators (proposal.md), including its "Submitted by:" line
 * (`emailValidationWorkflowService.ts:123`/`147`) — dropped in an earlier pass of this
 * change, restored per code review (an unintentional parity gap, not a scoped reduction). */
export function buildValidatorEmail(params: {
	entityType: EntityType;
	url: string;
	recordDisplayName: string;
	recordDate: string;
	validatorDisplayName: string;
	submitterDisplayName: string;
}): EmailContent {
	const { label } = ENTITY_TYPE_INFO[params.entityType];
	return {
		subject: "Event validation",
		text: [
			`Dear ${params.validatorDisplayName},`,
			"",
			`A new ${label} is waiting for your action. Click the link below to view the event.`,
			"",
			`Event name: ${params.recordDisplayName}`,
			`Event date: ${params.recordDate}`,
			`Submitted by: ${params.submitterDisplayName}`,
			"",
			`View event: ${params.url}`,
		].join("\n"),
		html: [
			`<p>Dear ${escapeHtml(params.validatorDisplayName)},</p>`,
			`<p>A new ${label} is waiting for your action. Click the link below to view the event.</p>`,
			`<p>Event name: ${escapeHtml(params.recordDisplayName)} <br />Event date: ${escapeHtml(params.recordDate)} <br />Submitted by: ${escapeHtml(params.submitterDisplayName)}</p>`,
			`<p><a href="${escapeHtml(params.url)}">View event</a></p>`,
		].join(""),
	};
}

/** Replicates emailValidationWorkflowStatusChangeNotificationService's "validated"/"published"
 * branches (proposal.md). */
export function buildSubmitterStatusEmail(params: {
	entityType: EntityType;
	url: string;
	submitterDisplayName: string;
	kind: "validated" | "published";
}): EmailContent {
	const { label } = ENTITY_TYPE_INFO[params.entityType];
	const subject =
		params.kind === "validated"
			? "Your record has been validated"
			: "Your record has been published";
	const bodyMessage =
		params.kind === "validated"
			? `Your ${label} has been validated.`
			: `Your ${label} has been published and is now publicly available.`;

	return {
		subject,
		text: [
			`Dear ${params.submitterDisplayName},`,
			"",
			bodyMessage,
			"",
			`View record: ${params.url}`,
		].join("\n"),
		html: [
			`<p>Dear ${escapeHtml(params.submitterDisplayName)},</p>`,
			`<p>${bodyMessage}</p>`,
			`<p><a href="${escapeHtml(params.url)}">View record</a></p>`,
		].join(""),
	};
}

/** Replicates emailAssigneesNotificationService (legacy submit-return) — proposal.md, design.md
 * Decision 2. */
export function buildReturnAssigneeEmail(params: {
	entityType: EntityType;
	url: string;
	assigneeDisplayName: string;
	submitterDisplayName: string;
	rejectionComments: string;
}): EmailContent {
	const { label } = ENTITY_TYPE_INFO[params.entityType];
	return {
		subject: "Returned record - action needed",
		text: [
			`Dear ${params.assigneeDisplayName},`,
			"",
			`A ${label} has been returned for revision.`,
			"",
			`Returned by: ${params.submitterDisplayName}`,
			"",
			`Comments: ${params.rejectionComments}`,
			"",
			`View: ${params.url}`,
		].join("\n"),
		html: [
			`<p>Dear ${escapeHtml(params.assigneeDisplayName)},</p>`,
			`<p>A ${label} has been returned for revision.</p>`,
			`<p>Returned by: ${escapeHtml(params.submitterDisplayName)}</p>`,
			`<p>Comments: ${escapeHtml(params.rejectionComments)}</p>`,
			`<p><a href="${escapeHtml(params.url)}">View</a></p>`,
		].join(""),
	};
}

/** Replicates ...needs-revision branch (legacy submit-reject) — Decision 2. Escapes
 * rejectionComments unconditionally, unlike the legacy template (Decision 7 — a deliberate
 * security fix, not a parity break). */
export function buildReturnSubmitterEmail(params: {
	entityType: EntityType;
	url: string;
	submitterDisplayName: string;
	rejectionComments: string;
}): EmailContent {
	const { label } = ENTITY_TYPE_INFO[params.entityType];
	return {
		subject: "Your record requires changes",
		text: [
			`Dear ${params.submitterDisplayName},`,
			"",
			`Your ${label} has been returned for revision.`,
			"",
			`Comments: ${params.rejectionComments}`,
			"",
			`View and edit record: ${params.url}`,
		].join("\n"),
		html: [
			`<p>Dear ${escapeHtml(params.submitterDisplayName)},</p>`,
			`<p>Your ${label} has been returned for revision.</p>`,
			`<p>Comments: ${escapeHtml(params.rejectionComments)}</p>`,
			`<p><a href="${escapeHtml(params.url)}">View and edit record</a></p>`,
		].join(""),
	};
}
