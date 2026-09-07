import "../setup";
import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hazardDriverTable } from "~/domains/hazardous-events/infrastructure/hazardDriverTable";
import { hazardousEventHazardDriverTable } from "~/domains/hazardous-events/infrastructure/hazardousEventHazardDriverTable";
import { countryAccounts } from "../testSchema/countryAccounts";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import {
	seedHazardousEvent,
	seedCountryAccount,
} from "../models/hazardousEventTestHelpers";

describe("hazardDriverTable", () => {
	it("inserts a driver under an existing country account", async () => {
		const countryAccountsId = await seedCountryAccount();

		const [row] = await dr
			.insert(hazardDriverTable)
			.values({ name: "Heavy rainfall", countryAccountsId })
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.name).toBe("Heavy rainfall");
		expect(row.countryAccountsId).toBe(countryAccountsId);
		expect(row.createdAt).toBeInstanceOf(Date);
		expect(row.updatedAt).toBeInstanceOf(Date);
	});

	it("rejects an insert with no name", async () => {
		const countryAccountsId = await seedCountryAccount();

		await expect(
			dr
				.insert(hazardDriverTable)
				// @ts-expect-error - name is required; verifying the DB-level not-null constraint
				.values({ countryAccountsId }),
		).rejects.toThrow();
	});

	it("rejects an insert with countryAccountsId = NULL", async () => {
		await expect(
			dr
				.insert(hazardDriverTable)
				// @ts-expect-error - countryAccountsId is required; verifying the not-null constraint
				.values({ name: "Driver With No Tenant", countryAccountsId: null }),
		).rejects.toThrow();
	});

	it("rejects an insert whose countryAccountsId matches no country_accounts row", async () => {
		await expect(
			dr.insert(hazardDriverTable).values({
				name: "Orphan Driver",
				countryAccountsId: crypto.randomUUID(),
			}),
		).rejects.toThrow();
	});

	it("allows two tenants to register a driver with the same name independently", async () => {
		const countryAccountsId1 = await seedCountryAccount();
		const countryAccountsId2 = await seedCountryAccount();

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardDriverTable)
				.values({
					name: "Heavy rainfall",
					countryAccountsId: countryAccountsId1,
				})
				.returning(),
			dr
				.insert(hazardDriverTable)
				.values({
					name: "Heavy rainfall",
					countryAccountsId: countryAccountsId2,
				})
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("allows two concurrent inserts under the same country_accounts_id", async () => {
		const countryAccountsId = await seedCountryAccount();

		const outcomes = await Promise.all([
			dr
				.insert(hazardDriverTable)
				.values({ name: "Heavy rainfall", countryAccountsId })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(hazardDriverTable)
				.values({ name: "Drought", countryAccountsId })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});

	describe("cascade-delete behaviour", () => {
		it("deleting the parent country_accounts row cascades and removes its hazard_driver rows", async () => {
			const countryAccountsId = await seedCountryAccount();
			const [inserted] = await dr
				.insert(hazardDriverTable)
				.values({ name: "Cascade Test Driver", countryAccountsId })
				.returning({ id: hazardDriverTable.id });

			await dr
				.delete(countryAccounts)
				.where(eq(countryAccounts.id, countryAccountsId));

			const remaining = await dr
				.select({ id: hazardDriverTable.id })
				.from(hazardDriverTable)
				.where(eq(hazardDriverTable.id, inserted.id));

			expect(remaining).toHaveLength(0);
		});
	});
});

async function insertHazardDriver(countryAccountsId: string): Promise<string> {
	const [driver] = await dr
		.insert(hazardDriverTable)
		.values({ name: "Test Driver", countryAccountsId })
		.returning({ id: hazardDriverTable.id });
	return driver.id;
}

describe("hazardousEventHazardDriverTable", () => {
	it("inserts an association between an existing event and an existing driver", async () => {
		const { id: hazardousEventId, countryAccountsId } =
			await seedHazardousEvent();
		const hazardDriverId = await insertHazardDriver(countryAccountsId);

		const [row] = await dr
			.insert(hazardousEventHazardDriverTable)
			.values({ hazardousEventId, hazardDriverId })
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.hazardousEventId).toBe(hazardousEventId);
		expect(row.hazardDriverId).toBe(hazardDriverId);
		expect(row.createdAt).toBeInstanceOf(Date);
		expect(row.updatedAt).toBeInstanceOf(Date);
	});

	it("rejects an insert with hazardousEventId = NULL", async () => {
		const { countryAccountsId } = await seedHazardousEvent();
		const hazardDriverId = await insertHazardDriver(countryAccountsId);

		await expect(
			dr.insert(hazardousEventHazardDriverTable).values({
				// @ts-expect-error - hazardousEventId is required; verifying the not-null constraint
				hazardousEventId: null,
				hazardDriverId,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert with hazardDriverId = NULL", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventHazardDriverTable).values({
				// @ts-expect-error - hazardDriverId is required; verifying the not-null constraint
				hazardDriverId: null,
				hazardousEventId,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose hazardousEventId matches no hazardous_event row", async () => {
		const { countryAccountsId } = await seedHazardousEvent();
		const hazardDriverId = await insertHazardDriver(countryAccountsId);

		await expect(
			dr.insert(hazardousEventHazardDriverTable).values({
				hazardousEventId: crypto.randomUUID(),
				hazardDriverId,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose hazardDriverId matches no hazard_driver row", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventHazardDriverTable).values({
				hazardousEventId,
				hazardDriverId: crypto.randomUUID(),
			}),
		).rejects.toThrow();
	});

	it("allows a hazardous event to be associated with multiple drivers", async () => {
		const { id: hazardousEventId, countryAccountsId } =
			await seedHazardousEvent();
		const driver1 = await insertHazardDriver(countryAccountsId);
		const driver2 = await insertHazardDriver(countryAccountsId);

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardousEventHazardDriverTable)
				.values({ hazardousEventId, hazardDriverId: driver1 })
				.returning(),
			dr
				.insert(hazardousEventHazardDriverTable)
				.values({ hazardousEventId, hazardDriverId: driver2 })
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("allows a hazard driver to be associated with multiple hazardous events", async () => {
		const { id: event1, countryAccountsId } = await seedHazardousEvent();
		const { id: event2 } = await seedHazardousEvent({ countryAccountsId });
		const hazardDriverId = await insertHazardDriver(countryAccountsId);

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardousEventHazardDriverTable)
				.values({ hazardousEventId: event1, hazardDriverId })
				.returning(),
			dr
				.insert(hazardousEventHazardDriverTable)
				.values({ hazardousEventId: event2, hazardDriverId })
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("rejects a duplicate association between the same event and driver", async () => {
		const { id: hazardousEventId, countryAccountsId } =
			await seedHazardousEvent();
		const hazardDriverId = await insertHazardDriver(countryAccountsId);

		await dr
			.insert(hazardousEventHazardDriverTable)
			.values({ hazardousEventId, hazardDriverId })
			.returning();

		await expect(
			dr
				.insert(hazardousEventHazardDriverTable)
				.values({ hazardousEventId, hazardDriverId })
				.returning(),
		).rejects.toThrow();
	});

	it("allows two concurrent inserts of different associations sharing the same hazardousEventId", async () => {
		const { id: hazardousEventId, countryAccountsId } =
			await seedHazardousEvent();
		const driver1 = await insertHazardDriver(countryAccountsId);
		const driver2 = await insertHazardDriver(countryAccountsId);

		const outcomes = await Promise.all([
			dr
				.insert(hazardousEventHazardDriverTable)
				.values({ hazardousEventId, hazardDriverId: driver1 })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(hazardousEventHazardDriverTable)
				.values({ hazardousEventId, hazardDriverId: driver2 })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});

	describe("cascade-delete behaviour", () => {
		it("deleting the parent hazardous_event row cascades and removes its hazardous_event_hazard_driver rows", async () => {
			const { id: hazardousEventId, countryAccountsId } =
				await seedHazardousEvent();
			const hazardDriverId = await insertHazardDriver(countryAccountsId);
			const [inserted] = await dr
				.insert(hazardousEventHazardDriverTable)
				.values({ hazardousEventId, hazardDriverId })
				.returning({ id: hazardousEventHazardDriverTable.id });

			await dr
				.delete(hazardousEventTable)
				.where(eq(hazardousEventTable.id, hazardousEventId));

			const remaining = await dr
				.select({ id: hazardousEventHazardDriverTable.id })
				.from(hazardousEventHazardDriverTable)
				.where(eq(hazardousEventHazardDriverTable.id, inserted.id));

			expect(remaining).toHaveLength(0);
		});

		it("deleting the parent hazard_driver row cascades and removes its hazardous_event_hazard_driver rows", async () => {
			const { id: hazardousEventId, countryAccountsId } =
				await seedHazardousEvent();
			const hazardDriverId = await insertHazardDriver(countryAccountsId);
			const [inserted] = await dr
				.insert(hazardousEventHazardDriverTable)
				.values({ hazardousEventId, hazardDriverId })
				.returning({ id: hazardousEventHazardDriverTable.id });

			await dr
				.delete(hazardDriverTable)
				.where(eq(hazardDriverTable.id, hazardDriverId));

			const remaining = await dr
				.select({ id: hazardousEventHazardDriverTable.id })
				.from(hazardousEventHazardDriverTable)
				.where(eq(hazardousEventHazardDriverTable.id, inserted.id));

			expect(remaining).toHaveLength(0);
		});
	});
});
