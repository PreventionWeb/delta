import "./setup";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dr } from "~/db.server";
import { eventTable } from "~/drizzle/schema/eventTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { DrizzleTransactionRunner } from "~/infrastructure/DrizzleTransactionRunner.server";
import { DrizzleHazardousEventRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server";
import { HazardousEvent } from "~/domains/hazardous-events/domain/HazardousEvent";
import {
	seedCountryAccount,
	seedSpecificHazard,
} from "../db/models/hazardousEventTestHelpers";

async function findEvent(id: string) {
	const rows = await dr.select().from(eventTable).where(eq(eventTable.id, id));
	return rows[0] ?? null;
}

describe("DrizzleTransactionRunner", () => {
	it("commits fn's writes and resolves with fn's own value", async () => {
		const runner = new DrizzleTransactionRunner(dr);
		const id = crypto.randomUUID();

		const result = await runner.run(async (tx) => {
			await tx.insert(eventTable).values({ id });
			return "fn-return-value";
		});

		expect(result).toBe("fn-return-value");
		await expect(findEvent(id)).resolves.not.toBeNull();
	});

	it("rolls back fn's writes and rejects with fn's own, unmodified error", async () => {
		const runner = new DrizzleTransactionRunner(dr);
		const id = crypto.randomUUID();
		const failure = new Error("boom");

		await expect(
			runner.run(async (tx) => {
				await tx.insert(eventTable).values({ id });
				throw failure;
			}),
		).rejects.toBe(failure);

		await expect(findEvent(id)).resolves.toBeNull();
	});

	it("passes a tx usable, with no cast, as IHazardousEventRepository.insert's tx — visible to a read via that same tx before run() resolves", async () => {
		const runner = new DrizzleTransactionRunner(dr);
		const repo = new DrizzleHazardousEventRepository(dr);
		const tenantId = (await seedCountryAccount()) as string;
		const specificHazardId = await seedSpecificHazard();
		const id = randomUUID();
		const entity = HazardousEvent.create(
			{
				id,
				tenantId,
				specificHazardId,
				startDate: "2026-01-01",
				endDate: "",
				nationalSpecification: "",
				description: "",
				chainsExplanation: "",
				magnitude: "",
				recordOriginator: "",
				dataSource: "",
				hazardousEventStatus: null,
				specificHazardLocalName: null,
				specificHazardNationalName: null,
				apiImportId: null,
				createdByUserId: null,
				updatedByUserId: null,
				submittedByUserId: null,
				submittedAt: null,
				createdAt: new Date("2026-01-01T00:00:00Z"),
				updatedAt: null,
				hazardDriverIds: [],
				attachments: [],
				fieldValues: [],
				customFieldValues: [],
			},
			new Set(),
			new Set(),
		);

		await runner.run(async (tx) => {
			await repo.insert(entity, tx);
			// Same tx, before commit — a cross-session read here (e.g. via this.db) would
			// deadlock PGlite's single-instance model, so this only checks the same-tx read.
			const rows = await tx
				.select()
				.from(hazardousEventTable)
				.where(eq(hazardousEventTable.id, id));
			expect(rows).toHaveLength(1);
		});

		await expect(repo.findById(id, tenantId)).resolves.toBeDefined();
	});

	it("runs two concurrent calls independently — one commits, one rolls back", async () => {
		const runner = new DrizzleTransactionRunner(dr);
		const commitId = crypto.randomUUID();
		const rollbackId = crypto.randomUUID();
		const failure = new Error("rollback-trigger");

		const [committed] = await Promise.all([
			runner.run(async (tx) => {
				await tx.insert(eventTable).values({ id: commitId });
				return "committed";
			}),
			runner
				.run(async (tx) => {
					await tx.insert(eventTable).values({ id: rollbackId });
					throw failure;
				})
				.catch((err: unknown) => err),
		]);

		expect(committed).toBe("committed");
		await expect(findEvent(commitId)).resolves.not.toBeNull();
		await expect(findEvent(rollbackId)).resolves.toBeNull();
	});
});
