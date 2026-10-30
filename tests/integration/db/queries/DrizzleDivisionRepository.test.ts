import "../setup";
import { randomUUID } from "crypto";
import { describe, it, expect, vi } from "vitest";
import { dr } from "~/db.server";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { DrizzleDivisionRepository } from "~/domains/hazardous-events/infrastructure/DrizzleDivisionRepository.server";
import { seedCountryAccount } from "../models/hazardousEventTestHelpers";

async function seedDivision(countryAccountsId: string | null): Promise<string> {
	const [row] = await dr
		.insert(divisionTable)
		.values({ name: { en: `Division ${randomUUID()}` }, countryAccountsId })
		.returning({ id: divisionTable.id });
	return row.id;
}

describe("DrizzleDivisionRepository", () => {
	describe("findValidDivisionIds", () => {
		it("includes only same-tenant division ids from a mixed-tenant set", async () => {
			const tenantA = (await seedCountryAccount()) as string;
			const tenantB = (await seedCountryAccount()) as string;
			const divisionA = await seedDivision(tenantA);
			const divisionB = await seedDivision(tenantB);
			const repo = new DrizzleDivisionRepository(dr);

			const result = await repo.findValidDivisionIds(
				[divisionA, divisionB],
				tenantA,
			);

			expect(result.has(divisionA)).toBe(true);
			expect(result.has(divisionB)).toBe(false);
		});

		// Guards against a weakened tenant filter: a tenant that already owns a division of its
		// own must not have that ownership let an unrelated, foreign-tenant id in the same query
		// leak into the result (a superset-leak a tenant-with-nothing-else fixture can't catch).
		it("resolves exactly the queried same-tenant ids, excluding a foreign-tenant id in the same query, when the tenant owns other divisions of its own", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const otherTenantId = (await seedCountryAccount()) as string;
			const ownDivision1 = await seedDivision(tenantId);
			const ownDivision2 = await seedDivision(tenantId);
			const foreignDivision = await seedDivision(otherTenantId);
			const repo = new DrizzleDivisionRepository(dr);

			const result = await repo.findValidDivisionIds(
				[ownDivision1, foreignDivision],
				tenantId,
			);

			expect(result).toEqual(new Set([ownDivision1]));
			// ownDivision2 was never queried -- confirms the result isn't "everything this tenant owns".
			expect(result.has(ownDivision2)).toBe(false);
		});

		it("excludes a non-existent id without throwing", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const repo = new DrizzleDivisionRepository(dr);

			await expect(
				repo.findValidDivisionIds([randomUUID()], tenantId),
			).resolves.toEqual(new Set());
		});

		it("resolves an empty set for an empty ids array, issuing no query", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const repo = new DrizzleDivisionRepository(dr);
			const selectSpy = vi.spyOn(dr, "select");

			await expect(repo.findValidDivisionIds([], tenantId)).resolves.toEqual(
				new Set(),
			);
			expect(selectSpy).not.toHaveBeenCalled();

			selectSpy.mockRestore();
		});

		it("excludes a null-countryAccountsId division row for two different queried tenants", async () => {
			const tenantA = (await seedCountryAccount()) as string;
			const tenantB = (await seedCountryAccount()) as string;
			const globalDivision = await seedDivision(null);
			const repo = new DrizzleDivisionRepository(dr);

			const resultA = await repo.findValidDivisionIds(
				[globalDivision],
				tenantA,
			);
			const resultB = await repo.findValidDivisionIds(
				[globalDivision],
				tenantB,
			);

			expect(resultA.has(globalDivision)).toBe(false);
			expect(resultB.has(globalDivision)).toBe(false);
		});

		it("called with an externally-supplied, not-yet-committed tx, includes a division row inserted but not yet committed under it", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const repo = new DrizzleDivisionRepository(dr);

			const { result, divisionId } = await dr.transaction(async (tx) => {
				const [division] = await tx
					.insert(divisionTable)
					.values({
						name: { en: `Division ${randomUUID()}` },
						countryAccountsId: tenantId,
					})
					.returning({ id: divisionTable.id });
				return {
					result: await repo.findValidDivisionIds([division.id], tenantId, tx),
					divisionId: division.id,
				};
			});

			expect(result.has(divisionId)).toBe(true);
		});
	});
});
