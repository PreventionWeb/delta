import "../setup";
import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { sourceCatalogTable } from "~/domains/hazardous-events/infrastructure/sourceCatalogTable";
import { countriesTable } from "../testSchema/countriesTable";
import { countryAccounts } from "../testSchema/countryAccounts";

async function insertCountryAccount(): Promise<string> {
	const [country] = await dr
		.insert(countriesTable)
		.values({ name: `Test Country ${crypto.randomUUID().slice(0, 8)}` })
		.returning({ id: countriesTable.id });
	const [account] = await dr
		.insert(countryAccounts)
		.values({ shortDescription: "TST", countryId: country.id })
		.returning({ id: countryAccounts.id });
	return account.id;
}

describe("sourceCatalogTable", () => {
	it("inserts a source under an existing country account", async () => {
		const countryAccountsId = await insertCountryAccount();

		const [row] = await dr
			.insert(sourceCatalogTable)
			.values({ name: "National Meteorological Service", countryAccountsId })
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.name).toBe("National Meteorological Service");
		expect(row.countryAccountsId).toBe(countryAccountsId);
		expect(row.createdAt).toBeInstanceOf(Date);
		expect(row.updatedAt).toBeInstanceOf(Date);
	});

	it("rejects an insert with no name", async () => {
		const countryAccountsId = await insertCountryAccount();

		await expect(
			dr
				.insert(sourceCatalogTable)
				// @ts-expect-error - name is required; verifying the DB-level not-null constraint
				.values({ countryAccountsId }),
		).rejects.toThrow();
	});

	it("rejects an insert with countryAccountsId = NULL", async () => {
		await expect(
			dr
				.insert(sourceCatalogTable)
				// @ts-expect-error - countryAccountsId is required; verifying the not-null constraint
				.values({ name: "Source With No Tenant", countryAccountsId: null }),
		).rejects.toThrow();
	});

	it("rejects an insert whose countryAccountsId matches no country_accounts row", async () => {
		await expect(
			dr.insert(sourceCatalogTable).values({
				name: "Orphan Source",
				countryAccountsId: crypto.randomUUID(),
			}),
		).rejects.toThrow();
	});

	it("allows two tenants to register a source with the same name independently", async () => {
		const countryAccountsId1 = await insertCountryAccount();
		const countryAccountsId2 = await insertCountryAccount();

		const [row1, row2] = await Promise.all([
			dr
				.insert(sourceCatalogTable)
				.values({
					name: "Satellite Imagery",
					countryAccountsId: countryAccountsId1,
				})
				.returning(),
			dr
				.insert(sourceCatalogTable)
				.values({
					name: "Satellite Imagery",
					countryAccountsId: countryAccountsId2,
				})
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("rejects a second row with the same name under the same country account", async () => {
		const countryAccountsId = await insertCountryAccount();

		await dr
			.insert(sourceCatalogTable)
			.values({ name: "Field Survey", countryAccountsId })
			.returning();

		await expect(
			dr
				.insert(sourceCatalogTable)
				.values({ name: "Field Survey", countryAccountsId })
				.returning(),
		).rejects.toThrow();
	});

	it("allows two concurrent inserts under the same country_accounts_id", async () => {
		const countryAccountsId = await insertCountryAccount();

		const outcomes = await Promise.all([
			dr
				.insert(sourceCatalogTable)
				.values({ name: "News Media", countryAccountsId })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(sourceCatalogTable)
				.values({ name: "Field Survey", countryAccountsId })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});

	describe("cascade-delete behaviour", () => {
		it("deleting the parent country_accounts row cascades and removes its source_catalog rows", async () => {
			const countryAccountsId = await insertCountryAccount();
			const [inserted] = await dr
				.insert(sourceCatalogTable)
				.values({ name: "Cascade Test Source", countryAccountsId })
				.returning({ id: sourceCatalogTable.id });

			await dr
				.delete(countryAccounts)
				.where(eq(countryAccounts.id, countryAccountsId));

			const remaining = await dr
				.select({ id: sourceCatalogTable.id })
				.from(sourceCatalogTable)
				.where(eq(sourceCatalogTable.id, inserted.id));

			expect(remaining).toHaveLength(0);
		});
	});
});
