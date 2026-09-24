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
	};
}

describe("INotificationPort conformance", () => {
	it("notify resolves when called directly with a fully-populated WorkflowActionNotification", async () => {
		const port = new RecordingNotificationPort();

		await expect(port.notify(makeNotification())).resolves.toBeUndefined();
	});

	it("records the exact payload passed to notify, across all 8 fields", async () => {
		const port = new RecordingNotificationPort();
		const notification = makeNotification();

		await port.notify(notification);

		expect(port.calls).toHaveLength(1);
		expect(port.calls[0]).toEqual(notification);
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

const _notificationShape: AssertEqual<
	keyof WorkflowActionNotification,
	| "instanceId"
	| "entityId"
	| "entityType"
	| "action"
	| "fromStatus"
	| "toStatus"
	| "actingUserId"
	| "occurredAt"
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

void _notificationShape;
void _notifyArity;
void _actionShape;
void _entityTypeShape;
void _fromStatusShape;
void _toStatusShape;
