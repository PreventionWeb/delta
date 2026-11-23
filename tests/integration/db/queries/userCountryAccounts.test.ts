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
import { getUserCountryAccountsWithUserByCountryAccountsId } from "~/db/queries/userCountryAccountsRepository";

describe("getUserCountryAccountsWithUserByCountryAccountsId", () => {
	const countryAId = crypto.randomUUID();
	const countryBId = crypto.randomUUID();
	const tenantAId = crypto.randomUUID();
	const tenantBId = crypto.randomUUID();
	const orgAlphaId = crypto.randomUUID();
	const orgBetaId = crypto.randomUUID();
	const orgWildcardId = crypto.randomUUID();

	const userIds: string[] = [];

	beforeAll(async () => {
		await dr.insert(countriesTable).values([
			{ id: countryAId, name: "Testland A" },
			{ id: countryBId, name: "Testland B" },
		]);

		await dr.insert(countryAccountsTable).values([
			{
				id: tenantAId,
				shortDescription: "Tenant A",
				countryId: countryAId,
				status: 1,
				type: "Official",
			},
			{
				id: tenantBId,
				shortDescription: "Tenant B",
				countryId: countryBId,
				status: 1,
				type: "Official",
			},
		]);

		await dr.insert(organizationTable).values([
			{ id: orgAlphaId, name: "Alpha Relief", countryAccountsId: tenantAId },
			{ id: orgBetaId, name: "Beta Agency", countryAccountsId: tenantAId },
			{
				id: orgWildcardId,
				name: "100%_Match Org",
				countryAccountsId: tenantAId,
			},
		]);

		const seedUsers = [
			{
				firstName: "Marie",
				lastName: "Joseph",
				email: "marie.joseph@alpha.org",
				emailVerified: true,
				role: "admin",
				isPrimaryAdmin: true,
				orgId: orgAlphaId,
				tenantId: tenantAId,
				addedAt: new Date("2026-09-14T10:00:00Z"),
			},
			{
				firstName: "Claire",
				lastName: "Dubois",
				email: "claire.dubois@beta.org",
				emailVerified: false,
				role: "data-viewer",
				isPrimaryAdmin: false,
				orgId: orgBetaId,
				tenantId: tenantAId,
				addedAt: new Date("2026-09-20T10:00:00Z"),
			},
			{
				firstName: "",
				lastName: "",
				email: "aaron.pending@example.org",
				emailVerified: false,
				role: "data-collector",
				isPrimaryAdmin: false,
				orgId: null,
				tenantId: tenantAId,
				addedAt: new Date("2026-08-01T10:00:00Z"),
			},
			{
				firstName: "Zara",
				lastName: "Percent",
				email: "zara@wildcard.org",
				emailVerified: true,
				role: "data-validator",
				isPrimaryAdmin: false,
				orgId: orgWildcardId,
				tenantId: tenantAId,
				addedAt: new Date("2026-09-10T10:00:00Z"),
			},
			{
				firstName: "Marie",
				lastName: "OtherTenant",
				email: "marie.other@tenantb.org",
				emailVerified: true,
				role: "admin",
				isPrimaryAdmin: true,
				orgId: null,
				tenantId: tenantBId,
				addedAt: new Date("2026-09-25T10:00:00Z"),
			},
		];

		for (const u of seedUsers) {
			const uid = crypto.randomUUID();
			userIds.push(uid);
			await dr.insert(userTable).values({
				id: uid,
				firstName: u.firstName,
				lastName: u.lastName,
				email: u.email,
				emailVerified: u.emailVerified,
			});
			await dr.insert(userCountryAccountsTable).values({
				userId: uid,
				countryAccountsId: u.tenantId,
				role: u.role,
				isPrimaryAdmin: u.isPrimaryAdmin,
				organizationId: u.orgId,
				addedAt: u.addedAt,
			});
		}
	});

	afterAll(async () => {
		for (const uid of userIds) {
			await dr.delete(userTable).where(eq(userTable.id, uid));
		}
		await dr
			.delete(organizationTable)
			.where(eq(organizationTable.countryAccountsId, tenantAId));
		await dr
			.delete(countryAccountsTable)
			.where(eq(countryAccountsTable.id, tenantAId));
		await dr
			.delete(countryAccountsTable)
			.where(eq(countryAccountsTable.id, tenantBId));
		await dr.delete(countriesTable).where(eq(countriesTable.id, countryAId));
		await dr.delete(countriesTable).where(eq(countriesTable.id, countryBId));
	});

	it("scopes results strictly to countryAccountsId and defaults to addedAt desc", async () => {
		const res = await getUserCountryAccountsWithUserByCountryAccountsId(
			1,
			25,
			tenantAId,
		);
		expect(res.pagination.total).toBe(4);
		expect(res.items.map((r) => r.user.email)).toEqual([
			"claire.dubois@beta.org",
			"marie.joseph@alpha.org",
			"zara@wildcard.org",
			"aaron.pending@example.org",
		]);
	});

	it("searches case-insensitively across first name, last name, full name, email, and organization", async () => {
		const byFullName = await getUserCountryAccountsWithUserByCountryAccountsId(
			1,
			25,
			tenantAId,
			{ search: "marie joseph" },
		);
		expect(byFullName.pagination.total).toBe(1);
		expect(byFullName.items[0].user.email).toBe("marie.joseph@alpha.org");

		const byEmail = await getUserCountryAccountsWithUserByCountryAccountsId(
			1,
			25,
			tenantAId,
			{ search: "aaron.pending@" },
		);
		expect(byEmail.pagination.total).toBe(1);
		expect(byEmail.items[0].user.email).toBe("aaron.pending@example.org");

		const byOrg = await getUserCountryAccountsWithUserByCountryAccountsId(
			1,
			25,
			tenantAId,
			{ search: "beta agency" },
		);
		expect(byOrg.pagination.total).toBe(1);
		expect(byOrg.items[0].user.email).toBe("claire.dubois@beta.org");
	});

	it("escapes SQL LIKE wildcards (% and _) in search terms", async () => {
		const wildcard = await getUserCountryAccountsWithUserByCountryAccountsId(
			1,
			25,
			tenantAId,
			{ search: "100%_" },
		);
		expect(wildcard.pagination.total).toBe(1);
		expect(wildcard.items[0].user.email).toBe("zara@wildcard.org");

		const lonePercent = await getUserCountryAccountsWithUserByCountryAccountsId(
			1,
			25,
			tenantAId,
			{ search: "%" },
		);
		expect(lonePercent.pagination.total).toBe(1);
		expect(lonePercent.items[0].user.email).toBe("zara@wildcard.org");
	});

	it("combines search and role filters accurately", async () => {
		const res = await getUserCountryAccountsWithUserByCountryAccountsId(
			1,
			25,
			tenantAId,
			{ search: "alpha", role: "admin" },
		);
		expect(res.pagination.total).toBe(1);
		expect(res.items[0].user.email).toBe("marie.joseph@alpha.org");

		const noMatch = await getUserCountryAccountsWithUserByCountryAccountsId(
			1,
			25,
			tenantAId,
			{ search: "alpha", role: "data-viewer" },
		);
		expect(noMatch.pagination.total).toBe(0);
		expect(noMatch.items).toEqual([]);
	});

	it("sorts across the full tenant list by name, status, org, role, and added before pagination", async () => {
		const byNameAsc = await getUserCountryAccountsWithUserByCountryAccountsId(
			1,
			2,
			tenantAId,
			{ sort: "name", dir: "asc" },
		);
		expect(byNameAsc.pagination.total).toBe(4);
		expect(byNameAsc.pagination.totalPages).toBe(2);
		expect(byNameAsc.items.map((r) => r.user.email)).toEqual([
			"aaron.pending@example.org",
			"claire.dubois@beta.org",
		]);

		const byNameAscPage2 =
			await getUserCountryAccountsWithUserByCountryAccountsId(2, 2, tenantAId, {
				sort: "name",
				dir: "asc",
			});
		expect(byNameAscPage2.items.map((r) => r.user.email)).toEqual([
			"marie.joseph@alpha.org",
			"zara@wildcard.org",
		]);

		const byStatusDesc =
			await getUserCountryAccountsWithUserByCountryAccountsId(
				1,
				25,
				tenantAId,
				{ sort: "status", dir: "desc" },
			);
		expect(
			byStatusDesc.items.slice(0, 2).every((r) => r.user.emailVerified),
		).toBe(true);
		expect(
			byStatusDesc.items.slice(2).every((r) => !r.user.emailVerified),
		).toBe(true);

		const byOrgAsc = await getUserCountryAccountsWithUserByCountryAccountsId(
			1,
			25,
			tenantAId,
			{ sort: "org", dir: "asc" },
		);
		expect(byOrgAsc.items.map((r) => r.organization?.name ?? null)).toEqual([
			null,
			"100%_Match Org",
			"Alpha Relief",
			"Beta Agency",
		]);

		const byRoleAsc = await getUserCountryAccountsWithUserByCountryAccountsId(
			1,
			25,
			tenantAId,
			{ sort: "role", dir: "asc" },
		);
		expect(byRoleAsc.items.map((r) => r.role)).toEqual([
			"admin",
			"data-collector",
			"data-validator",
			"data-viewer",
		]);
	});
});
