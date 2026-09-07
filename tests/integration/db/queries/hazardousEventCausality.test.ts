import "../setup";
import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hazardousEventCausalityTable } from "~/domains/hazardous-events/infrastructure/hazardousEventCausalityTable";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { seedHazardousEvent } from "../models/hazardousEventTestHelpers";

describe("hazardousEventCausalityTable", () => {
	it("inserts a causality link between two existing, distinct events", async () => {
		const { id: causeHazardousEventId, countryAccountsId } =
			await seedHazardousEvent();
		const { id: effectHazardousEventId } = await seedHazardousEvent({
			countryAccountsId,
		});

		const [row] = await dr
			.insert(hazardousEventCausalityTable)
			.values({
				causeHazardousEventId,
				effectHazardousEventId,
				causalityExplanation: "Heavy rainfall triggered a landslide",
			})
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.causeHazardousEventId).toBe(causeHazardousEventId);
		expect(row.effectHazardousEventId).toBe(effectHazardousEventId);
		expect(row.causalityExplanation).toBe(
			"Heavy rainfall triggered a landslide",
		);
		expect(row.createdAt).toBeInstanceOf(Date);
		expect(row.updatedAt).toBeInstanceOf(Date);
	});

	it("allows causality_explanation = NULL", async () => {
		const { id: causeHazardousEventId, countryAccountsId } =
			await seedHazardousEvent();
		const { id: effectHazardousEventId } = await seedHazardousEvent({
			countryAccountsId,
		});

		const [row] = await dr
			.insert(hazardousEventCausalityTable)
			.values({
				causeHazardousEventId,
				effectHazardousEventId,
				causalityExplanation: null,
			})
			.returning();

		expect(row.causalityExplanation).toBeNull();
	});

	it("rejects an insert with causeHazardousEventId = NULL", async () => {
		const { id: effectHazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventCausalityTable).values({
				// @ts-expect-error - causeHazardousEventId is required; verifying the not-null constraint
				causeHazardousEventId: null,
				effectHazardousEventId,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert with effectHazardousEventId = NULL", async () => {
		const { id: causeHazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventCausalityTable).values({
				// @ts-expect-error - effectHazardousEventId is required; verifying the not-null constraint
				effectHazardousEventId: null,
				causeHazardousEventId,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose causeHazardousEventId matches no hazardous_event row", async () => {
		const { id: effectHazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventCausalityTable).values({
				causeHazardousEventId: crypto.randomUUID(),
				effectHazardousEventId,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose effectHazardousEventId matches no hazardous_event row", async () => {
		const { id: causeHazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventCausalityTable).values({
				causeHazardousEventId,
				effectHazardousEventId: crypto.randomUUID(),
			}),
		).rejects.toThrow();
	});

	it("allows a hazardous event to be the cause of multiple effect events", async () => {
		const { id: causeHazardousEventId, countryAccountsId } =
			await seedHazardousEvent();
		const { id: effect1 } = await seedHazardousEvent({ countryAccountsId });
		const { id: effect2 } = await seedHazardousEvent({ countryAccountsId });

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardousEventCausalityTable)
				.values({ causeHazardousEventId, effectHazardousEventId: effect1 })
				.returning(),
			dr
				.insert(hazardousEventCausalityTable)
				.values({ causeHazardousEventId, effectHazardousEventId: effect2 })
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("allows a hazardous event to be the effect of multiple cause events", async () => {
		const { id: effectHazardousEventId, countryAccountsId } =
			await seedHazardousEvent();
		const { id: cause1 } = await seedHazardousEvent({ countryAccountsId });
		const { id: cause2 } = await seedHazardousEvent({ countryAccountsId });

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardousEventCausalityTable)
				.values({ causeHazardousEventId: cause1, effectHazardousEventId })
				.returning(),
			dr
				.insert(hazardousEventCausalityTable)
				.values({ causeHazardousEventId: cause2, effectHazardousEventId })
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("allows two concurrent inserts of different causality links sharing the same causeHazardousEventId", async () => {
		const { id: causeHazardousEventId, countryAccountsId } =
			await seedHazardousEvent();
		const { id: effect1 } = await seedHazardousEvent({ countryAccountsId });
		const { id: effect2 } = await seedHazardousEvent({ countryAccountsId });

		const outcomes = await Promise.all([
			dr
				.insert(hazardousEventCausalityTable)
				.values({ causeHazardousEventId, effectHazardousEventId: effect1 })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(hazardousEventCausalityTable)
				.values({ causeHazardousEventId, effectHazardousEventId: effect2 })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});

	describe("cascade-delete behaviour", () => {
		it("deleting the referenced cause event cascades and removes the causality row", async () => {
			const { id: causeHazardousEventId, countryAccountsId } =
				await seedHazardousEvent();
			const { id: effectHazardousEventId } = await seedHazardousEvent({
				countryAccountsId,
			});
			const [inserted] = await dr
				.insert(hazardousEventCausalityTable)
				.values({ causeHazardousEventId, effectHazardousEventId })
				.returning({ id: hazardousEventCausalityTable.id });

			await dr
				.delete(hazardousEventTable)
				.where(eq(hazardousEventTable.id, causeHazardousEventId));

			const remaining = await dr
				.select({ id: hazardousEventCausalityTable.id })
				.from(hazardousEventCausalityTable)
				.where(eq(hazardousEventCausalityTable.id, inserted.id));

			expect(remaining).toHaveLength(0);
		});

		it("deleting the referenced effect event cascades and removes the causality row", async () => {
			const { id: causeHazardousEventId, countryAccountsId } =
				await seedHazardousEvent();
			const { id: effectHazardousEventId } = await seedHazardousEvent({
				countryAccountsId,
			});
			const [inserted] = await dr
				.insert(hazardousEventCausalityTable)
				.values({ causeHazardousEventId, effectHazardousEventId })
				.returning({ id: hazardousEventCausalityTable.id });

			await dr
				.delete(hazardousEventTable)
				.where(eq(hazardousEventTable.id, effectHazardousEventId));

			const remaining = await dr
				.select({ id: hazardousEventCausalityTable.id })
				.from(hazardousEventCausalityTable)
				.where(eq(hazardousEventCausalityTable.id, inserted.id));

			expect(remaining).toHaveLength(0);
		});
	});

	describe("self-reference CHECK constraint", () => {
		it("rejects an insert where causeHazardousEventId equals effectHazardousEventId", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();

			await expect(
				dr.insert(hazardousEventCausalityTable).values({
					causeHazardousEventId: hazardousEventId,
					effectHazardousEventId: hazardousEventId,
				}),
			).rejects.toMatchObject({
				// distinguish from the not-null/FK cases: assert the specific CHECK fired
				cause: {
					constraint: "hazardous_event_causality_cause_effect_distinct_check",
				},
			});
		});

		it("does not block a multi-hop cycle (A causes B, B causes A)", async () => {
			const { id: eventA, countryAccountsId } = await seedHazardousEvent();
			const { id: eventB } = await seedHazardousEvent({ countryAccountsId });

			await dr.insert(hazardousEventCausalityTable).values({
				causeHazardousEventId: eventA,
				effectHazardousEventId: eventB,
			});
			const [reverse] = await dr
				.insert(hazardousEventCausalityTable)
				.values({
					causeHazardousEventId: eventB,
					effectHazardousEventId: eventA,
				})
				.returning();

			expect(reverse.id).toBeTruthy();
		});
	});
});
