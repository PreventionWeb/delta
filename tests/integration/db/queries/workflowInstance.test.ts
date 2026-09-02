import "../setup";
import { sql } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { workflowInstanceTable } from "~/domains/validation-workflow/infrastructure/workflowInstanceTable";

describe("workflowInstanceTable", () => {
	it("inserts with only entity_id/entity_type supplied and defaults status to DRAFT", async () => {
		const entityId = crypto.randomUUID();

		const [row] = await dr
			.insert(workflowInstanceTable)
			.values({ entityId, entityType: "HE" })
			.returning();

		expect(row.status).toBe("DRAFT");
	});

	it("rejects an insert with entity_type outside the declared set", async () => {
		const entityId = crypto.randomUUID();

		// Raw SQL bypasses the TS enum type, so it's the DB CHECK constraint that rejects this.
		await expect(
			dr.execute(
				sql`INSERT INTO workflow_instance (entity_id, entity_type) VALUES (${entityId}, 'XX')`,
			),
		).rejects.toThrow();
	});

	it("rejects an insert with status outside the declared set", async () => {
		const entityId = crypto.randomUUID();

		await expect(
			dr.execute(
				sql`INSERT INTO workflow_instance (entity_id, entity_type, status) VALUES (${entityId}, 'HE', 'ARCHIVED')`,
			),
		).rejects.toThrow();
	});

	it("rejects a second row with the same (entity_id, entity_type)", async () => {
		const entityId = crypto.randomUUID();

		await dr
			.insert(workflowInstanceTable)
			.values({ entityId, entityType: "HE" })
			.returning();

		await expect(
			dr
				.insert(workflowInstanceTable)
				.values({ entityId, entityType: "HE" })
				.returning(),
		).rejects.toThrow();
	});

	it("allows a second row with the same entity_id but a different entity_type", async () => {
		const entityId = crypto.randomUUID();

		await dr
			.insert(workflowInstanceTable)
			.values({ entityId, entityType: "HE" })
			.returning();

		const [row] = await dr
			.insert(workflowInstanceTable)
			.values({ entityId, entityType: "DE" })
			.returning();

		expect(row.entityType).toBe("DE");
	});

	it("allows exactly one of two concurrent inserts for the same (entity_id, entity_type) to succeed", async () => {
		const entityId = crypto.randomUUID();
		const insertOnce = () =>
			dr
				.insert(workflowInstanceTable)
				.values({ entityId, entityType: "HE" })
				.returning();

		// Captured individually so a rejection doesn't short-circuit Promise.all.
		const outcomes = await Promise.all([
			insertOnce().then(
				() => "fulfilled" as const,
				() => "rejected" as const,
			),
			insertOnce().then(
				() => "fulfilled" as const,
				() => "rejected" as const,
			),
		]);

		expect(outcomes.filter((o) => o === "fulfilled")).toHaveLength(1);
		expect(outcomes.filter((o) => o === "rejected")).toHaveLength(1);
	});

	it("carries a symmetric attribution + timestamp pair for all four transitions", async () => {
		// FK enforcement is covered by workflowHistory/workflowNotification tests instead.
		const [row] = await dr
			.insert(workflowInstanceTable)
			.values({ entityId: crypto.randomUUID(), entityType: "HE" })
			.returning();

		expect(row).toMatchObject({
			submittedByUserId: null,
			submittedAt: null,
			validatedByUserId: null,
			validatedAt: null,
			approvedByUserId: null,
			approvedAt: null,
			publishedByUserId: null,
			publishedAt: null,
		});
	});

	it("does not carry a countryAccountsId column", () => {
		// Deliberate — no tenant column, per design.md Decision 2.
		expect("countryAccountsId" in workflowInstanceTable).toBe(false);
	});
});
