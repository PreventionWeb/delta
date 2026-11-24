import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import {
	countryAccountsTable,
	organizationTable,
	userCountryAccountsTable,
	userTable,
} from "~/drizzle/schema";
import { countriesTable } from "../testSchema";
import { OrganizationRepository } from "~/db/queries/organizationRepository";

describe("OrganizationRepository", () => {
	const countryAId = crypto.randomUUID();
	const countryBId = crypto.randomUUID();
	const tenantAId = crypto.randomUUID();
	const tenantBId = crypto.randomUUID();

	const orgDgpcId = crypto.randomUUID();
	const orgWildcardId = crypto.randomUUID();
	const orgEmptyId = crypto.randomUUID();
	const orgTenantBId = crypto.randomUUID();

	const user1Id = crypto.randomUUID();
	const user2Id = crypto.randomUUID();
	const user3Id = crypto.randomUUID();

	beforeAll(async () => {
		await dr.insert(countriesTable).values([
			{ id: countryAId, name: "Org Testland A" },
			{ id: countryBId, name: "Org Testland B" },
		]);

		await dr.insert(countryAccountsTable).values([
			{
				id: tenantAId,
				shortDescription: "Org Tenant A",
				countryId: countryAId,
				status: 1,
				type: "Official",
			},
			{
				id: tenantBId,
				shortDescription: "Org Tenant B",
				countryId: countryBId,
				status: 1,
				type: "Official",
			},
		]);

		await dr.insert(organizationTable).values([
			{
				id: orgDgpcId,
				name: "DGPC Haiti",
				countryAccountsId: tenantAId,
			},
			{
				id: orgWildcardId,
				name: "100%_Match Org",
				countryAccountsId: tenantAId,
			},
			{
				id: orgEmptyId,
				name: "Statistics Office",
				countryAccountsId: tenantAId,
			},
			{
				id: orgTenantBId,
				name: "Tenant B Org",
				countryAccountsId: tenantBId,
			},
		]);

		await dr.insert(userTable).values([
			{
				id: user1Id,
				firstName: "Anna",
				lastName: "One",
				email: `org_u1_${Date.now()}@example.org`,
				emailVerified: true,
			},
			{
				id: user2Id,
				firstName: "Marie",
				lastName: "Two",
				email: `org_u2_${Date.now()}@example.org`,
				emailVerified: true,
			},
			{
				id: user3Id,
				firstName: "Louis",
				lastName: "Three",
				email: `org_u3_${Date.now()}@example.org`,
				emailVerified: true,
			},
		]);

		await dr.insert(userCountryAccountsTable).values([
			{
				userId: user1Id,
				countryAccountsId: tenantAId,
				role: "admin",
				isPrimaryAdmin: true,
				organizationId: orgDgpcId,
			},
			{
				userId: user2Id,
				countryAccountsId: tenantAId,
				role: "data-collector",
				isPrimaryAdmin: false,
				organizationId: orgDgpcId,
			},
			{
				userId: user3Id,
				countryAccountsId: tenantAId,
				role: "data-viewer",
				isPrimaryAdmin: false,
				organizationId: orgWildcardId,
			},
		]);
	});

	afterAll(async () => {
		await dr
			.delete(userCountryAccountsTable)
			.where(eq(userCountryAccountsTable.countryAccountsId, tenantAId));
		await dr.delete(userTable).where(eq(userTable.id, user1Id));
		await dr.delete(userTable).where(eq(userTable.id, user2Id));
		await dr.delete(userTable).where(eq(userTable.id, user3Id));
		await dr
			.delete(organizationTable)
			.where(eq(organizationTable.countryAccountsId, tenantAId));
		await dr
			.delete(organizationTable)
			.where(eq(organizationTable.countryAccountsId, tenantBId));
		await dr
			.delete(countryAccountsTable)
			.where(eq(countryAccountsTable.id, tenantAId));
		await dr
			.delete(countryAccountsTable)
			.where(eq(countryAccountsTable.id, tenantBId));
		await dr.delete(countriesTable).where(eq(countriesTable.id, countryAId));
		await dr.delete(countriesTable).where(eq(countriesTable.id, countryBId));
	});

	it("returns tenant-scoped organizations with user counts sorted by name asc by default", async () => {
		const res = await OrganizationRepository.listByCountryAccountsId({
			countryAccountsId: tenantAId,
			pagination: { page: 1, pageSize: 25 },
		});

		expect(res.pagination.totalItems).toBe(3);
		expect(res.items.map((o) => ({ name: o.name, users: o.users }))).toEqual([
			{ name: "100%_Match Org", users: 1 },
			{ name: "DGPC Haiti", users: 2 },
			{ name: "Statistics Office", users: 0 },
		]);
		expect(res.existingNames).toHaveLength(3);
		expect(res.existingNames).not.toContain("Tenant B Org");
	});

	it("sorts by users desc and asc across the tenant", async () => {
		const descRes = await OrganizationRepository.listByCountryAccountsId({
			countryAccountsId: tenantAId,
			sort: "users",
			dir: "desc",
			pagination: { page: 1, pageSize: 25 },
		});
		expect(descRes.items.map((o) => o.name)).toEqual([
			"DGPC Haiti",
			"100%_Match Org",
			"Statistics Office",
		]);

		const ascRes = await OrganizationRepository.listByCountryAccountsId({
			countryAccountsId: tenantAId,
			sort: "users",
			dir: "asc",
			pagination: { page: 1, pageSize: 25 },
		});
		expect(ascRes.items.map((o) => o.name)).toEqual([
			"Statistics Office",
			"100%_Match Org",
			"DGPC Haiti",
		]);
	});

	it("escapes ILIKE wildcards when searching by name and preserves full existingNames", async () => {
		const res = await OrganizationRepository.listByCountryAccountsId({
			countryAccountsId: tenantAId,
			search: "100%_",
			pagination: { page: 1, pageSize: 25 },
		});

		expect(res.pagination.totalItems).toBe(1);
		expect(res.items.map((o) => o.name)).toEqual(["100%_Match Org"]);
		expect(res.existingNames).toHaveLength(3);
	});

	it("clamps out-of-range page numbers to totalPages", async () => {
		const res = await OrganizationRepository.listByCountryAccountsId({
			countryAccountsId: tenantAId,
			sort: "name",
			dir: "asc",
			pagination: { page: 99, pageSize: 2 },
		});

		expect(res.pagination.page).toBe(2);
		expect(res.items.map((o) => o.name)).toEqual(["Statistics Office"]);
	});

	it("matches duplicate names case-insensitively and guards invalid UUID in getById", async () => {
		const dup = await OrganizationRepository.getByNameAndCountryAccountsId(
			"  dgpc haiti  ",
			tenantAId,
		);
		expect(dup?.id).toBe(orgDgpcId);

		const otherTenant =
			await OrganizationRepository.getByNameAndCountryAccountsId(
				"Tenant B Org",
				tenantAId,
			);
		expect(otherTenant).toBeUndefined();

		expect(await OrganizationRepository.getById("not-a-uuid")).toBeUndefined();
	});
});
