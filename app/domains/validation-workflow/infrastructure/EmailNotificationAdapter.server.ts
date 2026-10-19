import { Injectable } from "@nestjs/common";

import { sendEmail as defaultSendEmail } from "~/utils/email";
import { configPublicUrl as defaultConfigPublicUrl } from "~/utils/config";
import { UserRepository as defaultUserRepository } from "~/db/queries/UserRepository";
import type {
	INotificationPort,
	WorkflowActionNotification,
} from "~/domains/validation-workflow/application/ports/INotificationPort";
import {
	buildReturnAssigneeEmail,
	buildReturnSubmitterEmail,
	buildSubmitterStatusEmail,
	buildValidatorEmail,
	recordUrl,
} from "./EmailNotificationTemplates";

/** Narrowed to just what this adapter uses (ISP) — satisfied structurally by the real
 * `UserRepository` without this file depending on its full surface. */
export interface UserLookup {
	getById(
		id: string,
	): Promise<{ email: string; firstName: string; lastName: string } | null>;
}

export type SendEmailFn = typeof defaultSendEmail;
export type ConfigPublicUrlFn = typeof defaultConfigPublicUrl;

interface ResolvedRecipient {
	email: string;
	displayName: string;
}

interface EmailContent {
	subject: string;
	text: string;
	html: string;
}

/**
 * First real INotificationPort implementation (design.md). Singleton NestJS provider — no
 * BackendContext, single-locale English (Decision 8); stateless, no shared state across calls
 * (Decision 10).
 *
 * Collaborators are constructor-injected with real-module defaults, matching
 * `DrizzleWorkflowRepository.server.ts`'s DI convention (gate 5 SOLID review, DIP finding), so
 * tests pass fakes directly. Real `@Inject(TOKEN)` wiring awaits the roadmap's `5c` intent; the
 * defaults keep `new EmailNotificationAdapter()` working today and once `5c` lands.
 */
@Injectable()
export class EmailNotificationAdapter implements INotificationPort {
	constructor(
		private readonly userRepository: UserLookup = defaultUserRepository,
		private readonly sendEmail: SendEmailFn = defaultSendEmail,
		private readonly configPublicUrl: ConfigPublicUrlFn = defaultConfigPublicUrl,
	) {}

	async notify(notification: WorkflowActionNotification): Promise<void> {
		switch (notification.action) {
			case "submit-validation":
				return this.notifyValidators(notification);
			case "validate":
				// alsoApprove: false leaves toStatus === fromStatus === "SUBMITTED" — no legacy
				// equivalent event exists for that case (design.md Decision 6).
				if (notification.toStatus !== "APPROVED") {
					return;
				}
				return this.notifySubmitter(notification, "validated");
			case "publish":
				return this.notifySubmitter(notification, "published");
			case "return":
				return this.notifyReturn(notification);
			default: {
				// Exhaustiveness guard — a new action added to the union without a matching case fails to compile.
				const exhaustiveCheck: never = notification;
				throw new Error(
					`Unhandled WorkflowActionNotification action: ${JSON.stringify(exhaustiveCheck)}`,
				);
			}
		}
	}

	/** Null for a missing user or one with no email on file — both are silent-skip
	 * conditions for every caller, matching legacy's own `if (!user?.email) return;` guards. */
	private async resolveRecipient(
		userId: string,
	): Promise<ResolvedRecipient | null> {
		const user = await this.userRepository.getById(userId);
		if (!user || !user.email) {
			return null;
		}
		// "user" fallback matches legacy's own `submitterName || "user"` — avoids ever
		// rendering a bare "Dear ," when both name fields are empty.
		const displayName =
			[user.firstName, user.lastName]
				.filter((part): part is string => Boolean(part))
				.join(" ") || "user";
		return { email: user.email, displayName };
	}

	/** A submitter-name lookup used only for display text alongside a *different* batch of
	 * real recipients (validators/assignees) — unlike sendToMany's per-recipient resolves,
	 * this one isn't inside Promise.allSettled, so an uncaught throw here would abort that
	 * whole batch before any real recipient is even attempted, breaking Decision 5's
	 * guarantee. Matches legacy's own try/catch around this exact lookup
	 * (emailValidationWorkflowService.ts) — degrades to "" on any failure, same as an
	 * unresolvable submitter. */
	private async resolveSubmitterDisplayName(
		submittedByUserId: string | null,
	): Promise<string> {
		if (submittedByUserId === null) {
			return "";
		}
		try {
			const submitter = await this.resolveRecipient(submittedByUserId);
			return submitter?.displayName ?? "";
		} catch {
			return "";
		}
	}

	/** Continue-on-error across recipients (Decision 5): every id is attempted via
	 * Promise.allSettled regardless of earlier failures; only after all settle does one
	 * aggregated error surface. */
	private async sendToMany(
		userIds: readonly string[],
		buildEmail: (recipient: ResolvedRecipient) => EmailContent,
	): Promise<void> {
		const results = await Promise.allSettled(
			userIds.map(async (userId) => {
				const recipient = await this.resolveRecipient(userId);
				if (recipient === null) {
					return;
				}
				const { subject, text, html } = buildEmail(recipient);
				await this.sendEmail(recipient.email, subject, text, html);
			}),
		);

		const failures = results.filter(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		if (failures.length > 0) {
			throw new AggregateError(
				failures.map((failure) => failure.reason),
				`${failures.length} of ${userIds.length} recipient(s) failed to be notified`,
			);
		}
	}

	private async notifyValidators(
		notification: Extract<
			WorkflowActionNotification,
			{ action: "submit-validation" }
		>,
	): Promise<void> {
		const url = recordUrl(
			this.configPublicUrl(),
			notification.entityType,
			notification.entityId,
		);
		const submitterDisplayName = await this.resolveSubmitterDisplayName(
			notification.submittedByUserId,
		);

		await this.sendToMany(notification.validatorUserIds, (recipient) =>
			buildValidatorEmail({
				entityType: notification.entityType,
				url,
				recordDisplayName: notification.recordDisplayName,
				recordDate: notification.recordDate,
				validatorDisplayName: recipient.displayName,
				submitterDisplayName,
			}),
		);
	}

	private async notifySubmitter(
		notification: Extract<
			WorkflowActionNotification,
			{ action: "validate" | "publish" }
		>,
		kind: "validated" | "published",
	): Promise<void> {
		if (notification.submittedByUserId === null) {
			return;
		}
		const recipient = await this.resolveRecipient(
			notification.submittedByUserId,
		);
		if (recipient === null) {
			return;
		}

		const url = recordUrl(
			this.configPublicUrl(),
			notification.entityType,
			notification.entityId,
		);
		const { subject, text, html } = buildSubmitterStatusEmail({
			entityType: notification.entityType,
			url,
			submitterDisplayName: recipient.displayName,
			kind,
		});
		await this.sendEmail(recipient.email, subject, text, html);
	}

	/** Replicates both legacy "return" paths (Decision 2): non-empty assigneeUserIds ->
	 * emailAssigneesNotificationService; otherwise -> ...needs-revision branch (submit-reject). */
	private async notifyReturn(
		notification: Extract<WorkflowActionNotification, { action: "return" }>,
	): Promise<void> {
		const url = recordUrl(
			this.configPublicUrl(),
			notification.entityType,
			notification.entityId,
		);
		const { assigneeUserIds, rejectionComments } = notification;

		if (assigneeUserIds !== undefined && assigneeUserIds.length > 0) {
			const submitterDisplayName = await this.resolveSubmitterDisplayName(
				notification.submittedByUserId,
			);

			await this.sendToMany(assigneeUserIds, (recipient) =>
				buildReturnAssigneeEmail({
					entityType: notification.entityType,
					url,
					assigneeDisplayName: recipient.displayName,
					submitterDisplayName,
					rejectionComments,
				}),
			);
			return;
		}

		if (notification.submittedByUserId === null) {
			return;
		}
		const recipient = await this.resolveRecipient(
			notification.submittedByUserId,
		);
		if (recipient === null) {
			return;
		}

		const { subject, text, html } = buildReturnSubmitterEmail({
			entityType: notification.entityType,
			url,
			submitterDisplayName: recipient.displayName,
			rejectionComments,
		});
		await this.sendEmail(recipient.email, subject, text, html);
	}
}
