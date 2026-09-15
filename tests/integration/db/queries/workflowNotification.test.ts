import "../setup";
import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema";
import { workflowInstanceTable } from "~/domains/validation-workflow/infrastructure/workflowInstanceTable";
import { workflowNotificationTable } from "~/domains/validation-workflow/infrastructure/workflowNotificationTable";

/** Helper: insert a user row (notified_user_id/notified_by_user_id FK target) and return its id. */
async function insertUser(): Promise<string> {
	const id = crypto.randomUUID();
	await dr
		.insert(userTable)
		.values({ id, email: `workflow-notification-${id}@example.com` });
	return id;
}

/** Helper: insert a minimal workflow_instance row and return its id. */
async function insertWorkflowInstance(): Promise<string> {
	const [row] = await dr
		.insert(workflowInstanceTable)
		.values({ entityId: crypto.randomUUID(), entityType: "HE" })
		.returning({ id: workflowInstanceTable.id });
	return row.id;
}

describe("workflowNotificationTable", () => {
	it("inserts a notification with delivery already recorded and round-trips the values", async () => {
		const instanceId = await insertWorkflowInstance();
		const notifiedUserId = await insertUser();
		const notifiedByUserId = await insertUser();
		const notifiedAt = new Date("2026-01-15T12:00:00Z");

		const [row] = await dr
			.insert(workflowNotificationTable)
			.values({
				instanceId,
				notifiedUserId,
				notifiedByUserId,
				notifiedAt,
				notificationMessage: "Your submission requires validation.",
				channel: "email",
			})
			.returning();

		expect(row.notifiedAt).toEqual(notifiedAt);
		expect(row.notifiedByUserId).toBe(notifiedByUserId);
		expect(row.notificationMessage).toBe(
			"Your submission requires validation.",
		);
		expect(row.channel).toBe("email");
	});

	it("inserts a notification with delivery still pending", async () => {
		const instanceId = await insertWorkflowInstance();
		const notifiedUserId = await insertUser();

		const [row] = await dr
			.insert(workflowNotificationTable)
			.values({
				instanceId,
				notifiedUserId,
				notifiedByUserId: null,
				notifiedAt: null,
				notificationMessage: null,
				channel: null,
			})
			.returning();

		expect(row.notifiedAt).toBeNull();
		expect(row.notifiedByUserId).toBeNull();
		expect(row.notificationMessage).toBeNull();
		expect(row.channel).toBeNull();
	});

	it("rejects an insert whose instance_id matches no workflow_instance row", async () => {
		const notifiedUserId = await insertUser();

		await expect(
			dr
				.insert(workflowNotificationTable)
				.values({
					instanceId: crypto.randomUUID(),
					notifiedUserId,
					notifiedAt: null,
					channel: null,
				})
				.returning(),
		).rejects.toThrow();
	});

	it("cascades delete of the parent workflow instance to its notifications", async () => {
		const instanceId = await insertWorkflowInstance();
		const notifiedUserId = await insertUser();

		await dr.insert(workflowNotificationTable).values({
			instanceId,
			notifiedUserId,
			notifiedAt: null,
			channel: null,
		});

		await dr
			.delete(workflowInstanceTable)
			.where(eq(workflowInstanceTable.id, instanceId));

		const remaining = await dr
			.select({ id: workflowNotificationTable.id })
			.from(workflowNotificationTable)
			.where(eq(workflowNotificationTable.instanceId, instanceId));

		expect(remaining).toHaveLength(0);
	});
});
