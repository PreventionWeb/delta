import { describe, expect, it } from "vitest";
import type { EntityType, Status } from "../../domain/WorkflowInstance";
import type {
	INotificationPort,
	WorkflowActionNotification,
} from "./INotificationPort";

/** Recording test double for the "no-op double satisfies the interface" scenario (notification-port spec.md). */
class RecordingNotificationPort implements INotificationPort {
	readonly calls: WorkflowActionNotification[] = [];

	async notify(notification: WorkflowActionNotification): Promise<void> {
		this.calls.push(notification);
	}
}

function makeNotification(): WorkflowActionNotification {
	return {
		instanceId: "wf-1",
		entityId: "entity-1",
		entityType: "HE",
		action: "publish",
		fromStatus: "APPROVED",
		toStatus: "PUBLISHED",
		actingUserId: "user-1",
		occurredAt: new Date("2026-09-23T00:00:00.000Z"),
		submittedByUserId: "submitter-1",
	};
}

describe("INotificationPort conformance", () => {
	it("notify resolves when called directly with a fully-populated WorkflowActionNotification", async () => {
		const port = new RecordingNotificationPort();

		await expect(port.notify(makeNotification())).resolves.toBeUndefined();
	});

	it("records the exact payload passed to notify, across all 9 always-present fields", async () => {
		const port = new RecordingNotificationPort();
		const notification = makeNotification();

		await port.notify(notification);

		expect(port.calls).toHaveLength(1);
		expect(port.calls[0]).toEqual(notification);
	});

	it("records submittedByUserId, including a null placeholder, without requiring any action-specific field", async () => {
		const port = new RecordingNotificationPort();
		const notification: WorkflowActionNotification = {
			...makeNotification(),
			submittedByUserId: null,
		};

		await port.notify(notification);

		expect(port.calls[0].submittedByUserId).toBeNull();
	});

	it("records validatorUserIds/recordDisplayName/recordDate for a submit-validation notification — return-only fields aren't part of this branch's type at all", async () => {
		const port = new RecordingNotificationPort();
		const notification: WorkflowActionNotification = {
			instanceId: "wf-2",
			entityId: "entity-2",
			entityType: "HE",
			action: "submit-validation",
			fromStatus: "DRAFT",
			toStatus: "SUBMITTED",
			actingUserId: "user-2",
			occurredAt: new Date("2026-09-23T00:00:00.000Z"),
			submittedByUserId: "user-2",
			validatorUserIds: ["v1", "v2"],
			recordDisplayName: "Flood",
			recordDate: "2026-10-01",
		};

		await port.notify(notification);

		const recorded = port.calls[0];
		if (recorded.action !== "submit-validation") {
			throw new Error("expected a submit-validation notification");
		}
		expect(recorded.validatorUserIds).toEqual(["v1", "v2"]);
		expect(recorded.recordDisplayName).toBe("Flood");
		expect(recorded.recordDate).toBe("2026-10-01");
		// Gate 5 SOLID review (ISP finding): the discriminated union makes these
		// unrepresentable on this branch, not merely undefined at runtime.
		expect("rejectionComments" in recorded).toBe(false);
		expect("assigneeUserIds" in recorded).toBe(false);
	});

	it("records rejectionComments/assigneeUserIds for a return notification — submit-validation-only fields aren't part of this branch's type at all", async () => {
		const port = new RecordingNotificationPort();
		const notification: WorkflowActionNotification = {
			instanceId: "wf-3",
			entityId: "entity-3",
			entityType: "HE",
			action: "return",
			fromStatus: "SUBMITTED",
			toStatus: "REVISION_REQUESTED",
			actingUserId: "user-3",
			occurredAt: new Date("2026-09-23T00:00:00.000Z"),
			submittedByUserId: "submitter-3",
			rejectionComments: "Please fix the date",
			assigneeUserIds: ["a1"],
		};

		await port.notify(notification);

		const recorded = port.calls[0];
		if (recorded.action !== "return") {
			throw new Error("expected a return notification");
		}
		expect(recorded.rejectionComments).toBe("Please fix the date");
		expect(recorded.assigneeUserIds).toEqual(["a1"]);
		expect("validatorUserIds" in recorded).toBe(false);
		expect("recordDisplayName" in recorded).toBe(false);
		expect("recordDate" in recorded).toBe(false);
	});

	it("return without assigneeUserIds carries rejectionComments but omits the assignee list", async () => {
		const port = new RecordingNotificationPort();
		const notification: WorkflowActionNotification = {
			instanceId: "wf-4",
			entityId: "entity-4",
			entityType: "HE",
			action: "return",
			fromStatus: "SUBMITTED",
			toStatus: "REVISION_REQUESTED",
			actingUserId: "user-4",
			occurredAt: new Date("2026-09-23T00:00:00.000Z"),
			submittedByUserId: "submitter-4",
			rejectionComments: "Needs more detail",
		};

		await port.notify(notification);

		const recorded = port.calls[0];
		if (recorded.action !== "return") {
			throw new Error("expected a return notification");
		}
		expect(recorded.rejectionComments).toBe("Needs more detail");
		expect(recorded.assigneeUserIds).toBeUndefined();
	});
});

// [A]/[B] wrapping is load-bearing, not decorative: an un-wrapped conditional type distributes
// over a bare union, so e.g. AssertEqual<keyof Full, keyof Mutant> can evaluate to `true` even
// with a field dropped from Mutant (each union member round-trips individually, absorbing the
// never results). Wrapping in a one-tuple defeats that distribution — needed for bare unions
// here, not just the already-tuple Parameters<...> case IWorkflowRepository.test.ts uses it for.
type AssertEqual<A, B> = [A] extends [B]
	? [B] extends [A]
		? true
		: never
	: never;

/** Per-branch shape pinning (gate 5 SOLID review, ISP finding) — `keyof` on a union only yields
 * common keys, so `Extract` isolates each branch to pin it individually (notification-port spec.md). */
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

type BaseNotificationKeys =
	| "instanceId"
	| "entityId"
	| "entityType"
	| "action"
	| "fromStatus"
	| "toStatus"
	| "actingUserId"
	| "occurredAt"
	| "submittedByUserId";

const _submitValidationShape: AssertEqual<
	keyof SubmitValidationNotification,
	BaseNotificationKeys | "validatorUserIds" | "recordDisplayName" | "recordDate"
> = true;

const _validateShape: AssertEqual<
	keyof ValidateNotification,
	BaseNotificationKeys
> = true;

const _publishShape: AssertEqual<
	keyof PublishNotification,
	BaseNotificationKeys
> = true;

const _returnShape: AssertEqual<
	keyof ReturnNotification,
	BaseNotificationKeys | "rejectionComments" | "assigneeUserIds"
> = true;

const _notifyArity: AssertEqual<
	Parameters<INotificationPort["notify"]>,
	[WorkflowActionNotification]
> = true;

const _actionShape: AssertEqual<
	WorkflowActionNotification["action"],
	"submit-validation" | "validate" | "publish" | "return"
> = true;

// Must be the domain's real EntityType/Status unions, not a locally-redeclared literal that happens to overlap today.
const _entityTypeShape: AssertEqual<
	WorkflowActionNotification["entityType"],
	EntityType
> = true;
const _fromStatusShape: AssertEqual<
	WorkflowActionNotification["fromStatus"],
	Status
> = true;
const _toStatusShape: AssertEqual<
	WorkflowActionNotification["toStatus"],
	Status
> = true;

void _submitValidationShape;
void _validateShape;
void _publishShape;
void _returnShape;
void _notifyArity;
void _actionShape;
void _entityTypeShape;
void _fromStatusShape;
void _toStatusShape;
