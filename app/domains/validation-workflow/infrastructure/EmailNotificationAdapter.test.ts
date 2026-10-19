import { describe, expect, it, vi } from "vitest";

import type {
	EntityType,
	Status,
} from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { WorkflowActionNotification } from "~/domains/validation-workflow/application/ports/INotificationPort";

import {
	EmailNotificationAdapter,
	type ConfigPublicUrlFn,
	type SendEmailFn,
	type UserLookup,
} from "./EmailNotificationAdapter.server";

// ---------------------------------------------------------------------------
// Fakes — constructor-injected (gate 5 SOLID review, DIP finding), not
// vi.mock("~/utils/email" | "~/db/queries/UserRepository" | "~/utils/config"). Each test builds
// its own adapter instance from its own fakes, so there is no cross-test module-mock state to
// reset between tests.
// ---------------------------------------------------------------------------

interface FakeUser {
	email: string;
	firstName: string;
	lastName: string;
}

function makeUser(overrides: Partial<FakeUser> = {}): FakeUser {
	return {
		email: "jane@example.com",
		firstName: "Jane",
		lastName: "Doe",
		...overrides,
	};
}

function makeUserLookup(users: Record<string, FakeUser>): UserLookup {
	return {
		getById: async (id: string) => users[id] ?? null,
	};
}

/** sendEmail's real resolved value is nodemailer's SentMessageInfo; tests only care about
 * resolve vs reject, never read it. Routing through `unknown` avoids faking a full transport
 * response while still avoiding `any`. */
type SendEmailResolvedValue = Awaited<ReturnType<SendEmailFn>>;
const unusedSentMessageInfo = undefined as unknown as SendEmailResolvedValue;

function makeSendEmailFake(
	impl?: (
		to: string,
		subject: string,
		text: string,
		html: string,
	) => Promise<SendEmailResolvedValue>,
): SendEmailFn {
	return vi.fn(
		impl ?? (async () => unusedSentMessageInfo),
	) as unknown as SendEmailFn;
}

const configPublicUrlFake: ConfigPublicUrlFn = () => "https://example.com";

// ---------------------------------------------------------------------------
// Per-action notification fixtures — one builder per discriminated-union branch (ISP finding):
// WorkflowActionNotification has no single flat shape, so one makeNotification(overrides)
// helper can't build every variant.
// ---------------------------------------------------------------------------

type SubmitValidationNotification = Extract<
	WorkflowActionNotification,
	{ action: "submit-validation" }
>;
type ValidateNotification = Extract<
	WorkflowActionNotification,
	{ action: "validate" }
>;
type PublishNotification = Extract<
	WorkflowActionNotification,
	{ action: "publish" }
>;
type ReturnNotification = Extract<
	WorkflowActionNotification,
	{ action: "return" }
>;

const BASE_FIELDS = {
	instanceId: "wf-1",
	entityId: "entity-1",
	entityType: "HE" as EntityType,
	actingUserId: "actor-1",
	occurredAt: new Date("2026-10-01T00:00:00.000Z"),
	submittedByUserId: "submitter-1" as string | null,
};

function makeSubmitValidationNotification(
	overrides: Partial<SubmitValidationNotification> = {},
): SubmitValidationNotification {
	return {
		...BASE_FIELDS,
		action: "submit-validation",
		fromStatus: "DRAFT" as Status,
		toStatus: "SUBMITTED" as Status,
		validatorUserIds: ["v1", "v2"],
		recordDisplayName: "Flood",
		recordDate: "2026-10-01",
		...overrides,
	};
}

function makeValidateNotification(
	overrides: Partial<ValidateNotification> = {},
): ValidateNotification {
	return {
		...BASE_FIELDS,
		action: "validate",
		fromStatus: "SUBMITTED" as Status,
		toStatus: "APPROVED" as Status,
		...overrides,
	};
}

function makePublishNotification(
	overrides: Partial<PublishNotification> = {},
): PublishNotification {
	return {
		...BASE_FIELDS,
		action: "publish",
		fromStatus: "APPROVED" as Status,
		toStatus: "PUBLISHED" as Status,
		...overrides,
	};
}

function makeReturnNotification(
	overrides: Partial<ReturnNotification> = {},
): ReturnNotification {
	return {
		...BASE_FIELDS,
		action: "return",
		fromStatus: "SUBMITTED" as Status,
		toStatus: "REVISION_REQUESTED" as Status,
		rejectionComments: "Fix the date",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Requirement: EmailNotificationAdapter implements INotificationPort with no
// BackendContext dependency
// ---------------------------------------------------------------------------

describe("EmailNotificationAdapter implements INotificationPort with no BackendContext dependency", () => {
	it("constructs with zero arguments (no BackendContext, no explicitly-supplied collaborators)", () => {
		expect(() => new EmailNotificationAdapter()).not.toThrow();
	});

	it("resolves when notify() is called with a valid WorkflowActionNotification", async () => {
		const userLookup = makeUserLookup({
			"submitter-1": makeUser({ email: "sub1@example.com" }),
		});
		const adapter = new EmailNotificationAdapter(
			userLookup,
			makeSendEmailFake(),
			configPublicUrlFake,
		);

		await expect(
			adapter.notify(makePublishNotification()),
		).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Requirement: submit-validation sends the assigned-validators email to every
// validatorUserIds entry
// ---------------------------------------------------------------------------

describe("submit-validation sends the assigned-validators email to every validatorUserIds entry", () => {
	it("sends the assigned-validators email to each of two validators, with recordDisplayName and the mapped record URL in the body", async () => {
		const userLookup = makeUserLookup({
			v1: makeUser({ email: "v1@example.com" }),
			v2: makeUser({ email: "v2@example.com" }),
		});
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makeSubmitValidationNotification({
			entityType: "HE",
			entityId: "entity-1",
		});

		await adapter.notify(notification);

		expect(sendEmail).toHaveBeenCalledTimes(2);
		const calls = vi.mocked(sendEmail).mock.calls;
		const recipients = calls.map((call) => call[0]);
		expect(recipients).toContain("v1@example.com");
		expect(recipients).toContain("v2@example.com");
		for (const [, subject, text, html] of calls) {
			expect(subject).toBe("Event validation");
			expect(text).toContain("Flood");
			expect(html).toContain("Flood");
			expect(text).toContain("2026-10-01");
			expect(html).toContain("2026-10-01");
			expect(text).toContain("/hazardous-event/entity-1");
			expect(html).toContain("/hazardous-event/entity-1");
		}
	});

	it("includes the resolved submitter's display name in the assigned-validators email body", async () => {
		const userLookup = makeUserLookup({
			v1: makeUser({ email: "v1@example.com" }),
			"submitter-1": makeUser({
				email: "sub1@example.com",
				firstName: "Sam",
				lastName: "Submitter",
			}),
		});
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makeSubmitValidationNotification({
			validatorUserIds: ["v1"],
			submittedByUserId: "submitter-1",
		});

		await adapter.notify(notification);

		const [, , text, html] = vi.mocked(sendEmail).mock.calls[0];
		expect(text).toContain("Submitted by: Sam Submitter");
		expect(html).toContain("Submitted by: Sam Submitter");
	});

	it("still attempts every validator when the submitter-name lookup itself throws (gate 10 second-opinion review)", async () => {
		const userLookup: UserLookup = {
			getById: async (id: string) => {
				if (id === "submitter-1") {
					throw new Error("DB unavailable");
				}
				return id === "v1" ? makeUser({ email: "v1@example.com" }) : null;
			},
		};
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makeSubmitValidationNotification({
			validatorUserIds: ["v1"],
			submittedByUserId: "submitter-1",
		});

		await expect(adapter.notify(notification)).resolves.toBeUndefined();

		expect(sendEmail).toHaveBeenCalledTimes(1);
		const [, , text] = vi.mocked(sendEmail).mock.calls[0];
		expect(text).toContain("Submitted by: ");
	});

	it("skips a validator with no email on file without rejecting notify() or preventing the other validator's send", async () => {
		const userLookup = makeUserLookup({
			v1: makeUser({ email: "" }),
			v2: makeUser({ email: "v2@example.com" }),
		});
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makeSubmitValidationNotification();

		await expect(adapter.notify(notification)).resolves.toBeUndefined();

		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe("v2@example.com");
	});
});

// ---------------------------------------------------------------------------
// Requirement: validate and publish send the submitter notification only when
// a corresponding legacy event exists
// ---------------------------------------------------------------------------

describe("validate and publish send the submitter notification only when a corresponding legacy event exists", () => {
	it("sends the validated email to the submitter when action is validate and toStatus is APPROVED", async () => {
		const userLookup = makeUserLookup({
			"submitter-1": makeUser({ email: "sub1@example.com" }),
		});
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makeValidateNotification({
			toStatus: "APPROVED",
			submittedByUserId: "submitter-1",
		});

		await adapter.notify(notification);

		expect(sendEmail).toHaveBeenCalledTimes(1);
		const [to, subject, text, html] = vi.mocked(sendEmail).mock.calls[0];
		expect(to).toBe("sub1@example.com");
		// Exact subject, not just a lowercase substring — distinguishes this from the
		// "publish" branch's own distinct subject below, rather than both merely containing
		// a shared word.
		expect(subject).toBe("Your record has been validated");
		expect(text).toContain("validated");
		expect(html).toContain("validated");
	});

	it("sends no email when action is validate and toStatus is unchanged (SUBMITTED)", async () => {
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			makeUserLookup({}),
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makeValidateNotification({
			fromStatus: "SUBMITTED",
			toStatus: "SUBMITTED",
			submittedByUserId: "submitter-1",
		});

		await expect(adapter.notify(notification)).resolves.toBeUndefined();

		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("sends the published email to the submitter when action is publish", async () => {
		const userLookup = makeUserLookup({
			"submitter-2": makeUser({ email: "sub2@example.com" }),
		});
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makePublishNotification({
			submittedByUserId: "submitter-2",
		});

		await adapter.notify(notification);

		expect(sendEmail).toHaveBeenCalledTimes(1);
		const [to, subject, text, html] = vi.mocked(sendEmail).mock.calls[0];
		expect(to).toBe("sub2@example.com");
		// Exact subject — distinct from "validate"/APPROVED's own subject above, proving the
		// two branches route to different templates, not just that both mention "published".
		expect(subject).toBe("Your record has been published");
		expect(text).toContain("published");
		expect(html).toContain("published");
	});

	it("sends no email and resolves normally when submittedByUserId is null", async () => {
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			makeUserLookup({}),
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makePublishNotification({ submittedByUserId: null });

		await expect(adapter.notify(notification)).resolves.toBeUndefined();

		expect(sendEmail).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Requirement: return sends to assigneeUserIds when present and non-empty,
// otherwise to submittedByUserId
// ---------------------------------------------------------------------------

describe("return sends to assigneeUserIds when present and non-empty, otherwise to submittedByUserId", () => {
	it("notifies only the assignees, never the submitter, when assigneeUserIds is present and non-empty", async () => {
		const userLookup = makeUserLookup({
			// Distinct names from the submitter below — otherwise "Jane Doe" could appear via
			// either assignee's own "Dear <name>," greeting line, letting a deleted "Returned
			// by: <submitter>" line go unnoticed (the submitter's name would still show up).
			a1: makeUser({
				email: "a1@example.com",
				firstName: "Alice",
				lastName: "Assignee",
			}),
			a2: makeUser({
				email: "a2@example.com",
				firstName: "Bob",
				lastName: "Assignee",
			}),
			"submitter-1": makeUser({ email: "sub1@example.com" }),
		});
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makeReturnNotification({
			assigneeUserIds: ["a1", "a2"],
		});

		await adapter.notify(notification);

		expect(sendEmail).toHaveBeenCalledTimes(2);
		const calls = vi.mocked(sendEmail).mock.calls;
		const recipients = calls.map((call) => call[0]);
		expect(recipients).toContain("a1@example.com");
		expect(recipients).toContain("a2@example.com");
		expect(recipients).not.toContain("sub1@example.com");
		for (const [, subject, text, html] of calls) {
			expect(subject).toBe("Returned record - action needed");
			// text and html checked independently — concatenating them would let either
			// body go empty without failing, since the other copy would mask it.
			expect(text).toContain("Fix the date");
			expect(html).toContain("Fix the date");
			// "Jane Doe" is submitter-1's resolved display name (makeUser's defaults) —
			// confirms the assignee template includes "Returned by: <submitter>", not just
			// the rejection comments.
			expect(text).toContain("Jane Doe");
			expect(html).toContain("Jane Doe");
		}
	});

	it("still attempts every assignee when the submitter-name lookup itself throws (gate 10 second-opinion review)", async () => {
		const userLookup: UserLookup = {
			getById: async (id: string) => {
				if (id === "submitter-1") {
					throw new Error("DB unavailable");
				}
				if (id === "a1" || id === "a2") {
					return makeUser({ email: `${id}@example.com` });
				}
				return null;
			},
		};
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makeReturnNotification({
			assigneeUserIds: ["a1", "a2"],
			submittedByUserId: "submitter-1",
		});

		await expect(adapter.notify(notification)).resolves.toBeUndefined();

		expect(sendEmail).toHaveBeenCalledTimes(2);
		const recipients = vi.mocked(sendEmail).mock.calls.map((call) => call[0]);
		expect(recipients).toContain("a1@example.com");
		expect(recipients).toContain("a2@example.com");
	});

	it("notifies the submitter when assigneeUserIds is absent", async () => {
		const userLookup = makeUserLookup({
			"submitter-1": makeUser({ email: "sub1@example.com" }),
		});
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makeReturnNotification();

		await adapter.notify(notification);

		expect(sendEmail).toHaveBeenCalledTimes(1);
		const [to, subject, text, html] = vi.mocked(sendEmail).mock.calls[0];
		expect(to).toBe("sub1@example.com");
		expect(subject).toBe("Your record requires changes");
		expect(text).toContain("Fix the date");
		expect(html).toContain("Fix the date");
	});

	it("notifies the submitter, not zero recipients, when assigneeUserIds is an empty array", async () => {
		const userLookup = makeUserLookup({
			"submitter-1": makeUser({ email: "sub1@example.com" }),
		});
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makeReturnNotification({ assigneeUserIds: [] });

		await adapter.notify(notification);

		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe("sub1@example.com");
	});
});

// ---------------------------------------------------------------------------
// Requirement: Every interpolated value in an HTML email body is escaped
// ---------------------------------------------------------------------------

describe("Every interpolated value in an HTML email body is escaped", () => {
	it("escapes rejection comments containing HTML in the submitter notification's HTML body", async () => {
		const userLookup = makeUserLookup({
			"submitter-1": makeUser({ email: "sub1@example.com" }),
		});
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makeReturnNotification({
			rejectionComments: "<script>alert(1)</script>",
		});

		await adapter.notify(notification);

		const html = vi.mocked(sendEmail).mock.calls[0][3];
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain("<script>");
	});

	it("escapes rejection comments containing HTML in the assignees notification's HTML body", async () => {
		const userLookup = makeUserLookup({
			a1: makeUser({ email: "a1@example.com" }),
		});
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makeReturnNotification({
			assigneeUserIds: ["a1"],
			rejectionComments: "<b>bad</b>",
		});

		await adapter.notify(notification);

		const html = vi.mocked(sendEmail).mock.calls[0][3];
		expect(html).toContain("&lt;b&gt;");
		expect(html).not.toContain("<b>");
	});
});

// ---------------------------------------------------------------------------
// Requirement: A failed send for one recipient does not prevent sends to
// other recipients in the same notify() call
// ---------------------------------------------------------------------------

describe("A failed send for one recipient does not prevent sends to other recipients in the same notify() call", () => {
	it("still emails the other validator when one validator's send fails, rejecting only after both attempts complete", async () => {
		const userLookup = makeUserLookup({
			v1: makeUser({ email: "v1@example.com" }),
			v2: makeUser({ email: "v2@example.com" }),
		});
		const attempted: string[] = [];
		const sendEmail = makeSendEmailFake(async (to) => {
			attempted.push(to);
			if (to === "v1@example.com") {
				throw new Error("smtp failure for v1");
			}
			return unusedSentMessageInfo;
		});
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makeSubmitValidationNotification({
			validatorUserIds: ["v1", "v2"],
		});

		await expect(adapter.notify(notification)).rejects.toThrow();

		expect(sendEmail).toHaveBeenCalledTimes(2);
		expect(attempted).toContain("v1@example.com");
		expect(attempted).toContain("v2@example.com");
	});

	it("attempts every recipient and rejects exactly once when all recipients fail", async () => {
		const userLookup = makeUserLookup({
			a1: makeUser({ email: "a1@example.com" }),
			a2: makeUser({ email: "a2@example.com" }),
		});
		const sendEmail = makeSendEmailFake(async () => {
			throw new Error("smtp failure");
		});
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notification = makeReturnNotification({
			assigneeUserIds: ["a1", "a2"],
		});

		await expect(adapter.notify(notification)).rejects.toThrow();

		expect(sendEmail).toHaveBeenCalledTimes(2);
	});
});

// ---------------------------------------------------------------------------
// Requirement: Entity type maps to the correct URL segment and display label
// ---------------------------------------------------------------------------

describe("Entity type maps to the correct URL segment and display label", () => {
	it("maps each of HE/DE/DR to its own URL segment and display label", async () => {
		const userLookup = makeUserLookup({
			"submitter-1": makeUser({ email: "sub1@example.com" }),
		});
		const cases: Array<{
			entityType: EntityType;
			segment: string;
			label: string;
		}> = [
			{
				entityType: "HE",
				segment: "/hazardous-event/entity-1",
				label: "hazardous event",
			},
			{
				entityType: "DE",
				segment: "/disaster-event/entity-1",
				label: "disaster event",
			},
			{
				entityType: "DR",
				segment: "/disaster-record/entity-1",
				label: "disaster record",
			},
		];

		for (const { entityType, segment, label } of cases) {
			const sendEmail = makeSendEmailFake();
			const adapter = new EmailNotificationAdapter(
				userLookup,
				sendEmail,
				configPublicUrlFake,
			);
			const notification = makePublishNotification({
				entityType,
				entityId: "entity-1",
				submittedByUserId: "submitter-1",
			});

			await adapter.notify(notification);

			expect(sendEmail).toHaveBeenCalledTimes(1);
			const [, , text, html] = vi.mocked(sendEmail).mock.calls[0];
			expect(text).toContain(segment);
			expect(html).toContain(segment);
			expect(`${text} ${html}`.toLowerCase()).toContain(label);
		}
	});
});

// ---------------------------------------------------------------------------
// Requirement: No concurrent-callers scenario applies — the adapter holds no
// shared mutable state
// ---------------------------------------------------------------------------

describe("No concurrent-callers scenario applies — the adapter holds no shared mutable state", () => {
	it("keeps two concurrent notify() calls for different notifications independent of each other", async () => {
		const userLookup = makeUserLookup({
			"submitter-A": makeUser({ email: "a@example.com" }),
			"submitter-B": makeUser({ email: "b@example.com" }),
		});
		const sendEmail = makeSendEmailFake();
		const adapter = new EmailNotificationAdapter(
			userLookup,
			sendEmail,
			configPublicUrlFake,
		);
		const notificationA = makePublishNotification({
			instanceId: "wf-A",
			submittedByUserId: "submitter-A",
		});
		const notificationB = makeReturnNotification({
			instanceId: "wf-B",
			submittedByUserId: "submitter-B",
			rejectionComments: "Fix B's record",
		});

		await Promise.all([
			adapter.notify(notificationA),
			adapter.notify(notificationB),
		]);

		expect(sendEmail).toHaveBeenCalledTimes(2);
		const calls = vi.mocked(sendEmail).mock.calls;
		const callToA = calls.find((call) => call[0] === "a@example.com");
		const callToB = calls.find((call) => call[0] === "b@example.com");
		expect(callToA).toBeDefined();
		expect(callToB).toBeDefined();
		if (!callToA || !callToB) {
			throw new Error(
				"expected sendEmail to have been called for both A and B",
			);
		}
		// A's own notification carries no rejectionComments — B's content must not leak into it.
		expect(`${callToA[2]} ${callToA[3]}`).not.toContain("Fix B's record");
		// B's email must carry its own rejectionComments, not be affected by A's concurrent call.
		expect(`${callToB[2]} ${callToB[3]}`).toContain("Fix B's record");
		expect(callToB[0]).not.toBe("a@example.com");
	});
});
