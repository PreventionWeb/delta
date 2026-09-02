import "../setup";
import { eq, sql } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema";
import { workflowInstanceTable } from "~/domains/validation-workflow/infrastructure/workflowInstanceTable";
import { workflowHistoryTable } from "~/domains/validation-workflow/infrastructure/workflowHistoryTable";

/** Helper: insert a user row (acting_user_id FK target) and return its id. */
async function insertUser(): Promise<string> {
	const id = crypto.randomUUID();
	await dr
		.insert(userTable)
		.values({ id, email: `workflow-history-${id}@example.com` });
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

describe("workflowHistoryTable", () => {
	it("inserts the initial transition with no prior status", async () => {
		const instanceId = await insertWorkflowInstance();
		const actingUserId = await insertUser();

		const [row] = await dr
			.insert(workflowHistoryTable)
			.values({
				instanceId,
				fromStatus: null,
				toStatus: "DRAFT",
				actingUserId,
			})
			.returning();

		expect(row.fromStatus).toBeNull();
		expect(row.toStatus).toBe("DRAFT");
	});

	it("inserts a transition between two declared statuses", async () => {
		const instanceId = await insertWorkflowInstance();
		const actingUserId = await insertUser();

		const [row] = await dr
			.insert(workflowHistoryTable)
			.values({
				instanceId,
				fromStatus: "DRAFT",
				toStatus: "SUBMITTED",
				actingUserId,
			})
			.returning();

		expect(row.fromStatus).toBe("DRAFT");
		expect(row.toStatus).toBe("SUBMITTED");
	});

	it("stores an optional comment on a transition, and allows omitting it", async () => {
		const instanceId = await insertWorkflowInstance();
		const actingUserId = await insertUser();

		const [withComment] = await dr
			.insert(workflowHistoryTable)
			.values({
				instanceId,
				fromStatus: "SUBMITTED",
				toStatus: "REVISION_REQUESTED",
				actingUserId,
				comment: "Missing supporting evidence for the reported magnitude.",
			})
			.returning();
		expect(withComment.comment).toBe(
			"Missing supporting evidence for the reported magnitude.",
		);

		const [withoutComment] = await dr
			.insert(workflowHistoryTable)
			.values({
				instanceId,
				fromStatus: "REVISION_REQUESTED",
				toStatus: "SUBMITTED",
				actingUserId,
			})
			.returning();
		expect(withoutComment.comment).toBeNull();
	});

	it("rejects an insert with to_status outside the declared set", async () => {
		const instanceId = await insertWorkflowInstance();
		const actingUserId = await insertUser();

		// Raw SQL bypasses the TS enum type, so it's the DB CHECK constraint that rejects this.
		await expect(
			dr.execute(
				sql`INSERT INTO workflow_history (instance_id, to_status, acting_user_id) VALUES (${instanceId}, 'ARCHIVED', ${actingUserId})`,
			),
		).rejects.toThrow();
	});

	it("rejects an insert whose instance_id matches no workflow_instance row", async () => {
		const actingUserId = await insertUser();

		await expect(
			dr
				.insert(workflowHistoryTable)
				.values({
					instanceId: crypto.randomUUID(),
					fromStatus: null,
					toStatus: "DRAFT",
					actingUserId,
				})
				.returning(),
		).rejects.toThrow();
	});

	it("cascades delete of the parent workflow instance to its history rows", async () => {
		const instanceId = await insertWorkflowInstance();
		const actingUserId = await insertUser();

		await dr.insert(workflowHistoryTable).values([
			{ instanceId, fromStatus: null, toStatus: "DRAFT", actingUserId },
			{
				instanceId,
				fromStatus: "DRAFT",
				toStatus: "SUBMITTED",
				actingUserId,
			},
		]);

		await dr
			.delete(workflowInstanceTable)
			.where(eq(workflowInstanceTable.id, instanceId));

		const remaining = await dr
			.select({ id: workflowHistoryTable.id })
			.from(workflowHistoryTable)
			.where(eq(workflowHistoryTable.instanceId, instanceId));

		expect(remaining).toHaveLength(0);
	});
});
