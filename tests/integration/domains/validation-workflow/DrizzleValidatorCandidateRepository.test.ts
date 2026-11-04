import "../../db/setup";
import { describe, expect, it } from "vitest";
import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema/userTable";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { DrizzleValidatorCandidateRepository } from "~/domains/validation-workflow/infrastructure/DrizzleValidatorCandidateRepository.server";
import { seedCountryAccount } from "../../db/models/hazardousEventTestHelpers";

async function seedUserWithRole(
	countryAccountsId: string,
	role: "data-validator" | "admin",
	options: { emailVerified?: boolean } = {},
): Promise<string> {
	const [user] = await dr
		.insert(userTable)
		.values({
			email: `${role}-${crypto.randomUUID()}@test.com`,
			emailVerified: options.emailVerified ?? true,
		})
		.returning();
	await dr
		.insert(userCountryAccountsTable)
		.values({ userId: user.id, countryAccountsId, role });
	return user.id;
}

// Mechanical findByRole() query only -- the admin-fallback policy moved to
// FindValidatorCandidatesUseCase (SOLID review, DIP finding), covered by its own unit test.
describe("DrizzleValidatorCandidateRepository against PGlite", () => {
	it("resolves tenant-scoped candidates with the given role, excluding the acting user", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const v1 = await seedUserWithRole(tenantId, "data-validator");
		const v2 = await seedUserWithRole(tenantId, "data-validator");
		const actingUser = await seedUserWithRole(tenantId, "data-validator");
		const repository = new DrizzleValidatorCandidateRepository(dr);

		const result = await repository.findByRole(
			tenantId,
			"data-validator",
			actingUser,
		);

		expect(result.map((c) => c.id).sort()).toEqual([v1, v2].sort());
	});

	it("never returns a candidate belonging to a different tenant", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const otherTenantId = (await seedCountryAccount()) as string;
		const v1 = await seedUserWithRole(tenantId, "data-validator");
		await seedUserWithRole(otherTenantId, "data-validator");
		const repository = new DrizzleValidatorCandidateRepository(dr);

		const result = await repository.findByRole(
			tenantId,
			"data-validator",
			crypto.randomUUID(),
		);

		expect(result.map((c) => c.id)).toEqual([v1]);
	});

	it("never returns a candidate with a different role", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		await seedUserWithRole(tenantId, "data-validator");
		const admin1 = await seedUserWithRole(tenantId, "admin");
		const repository = new DrizzleValidatorCandidateRepository(dr);

		const result = await repository.findByRole(
			tenantId,
			"admin",
			crypto.randomUUID(),
		);

		expect(result.map((c) => c.id)).toEqual([admin1]);
	});

	it("resolves an empty array, not a rejection, when no candidate matches", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const repository = new DrizzleValidatorCandidateRepository(dr);

		await expect(
			repository.findByRole(tenantId, "data-validator", crypto.randomUUID()),
		).resolves.toEqual([]);
	});
});
