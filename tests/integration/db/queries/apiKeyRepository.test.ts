import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import { apiKeyTable, countryAccountsTable, userTable } from "~/drizzle/schema";
import { countriesTable } from "../testSchema";
import { ApiKeyRepository } from "~/db/queries/apiKeyRepository";

describe("ApiKeyRepository", () => {
	const countryAId = crypto.randomUUID();
	const countryBId = crypto.randomUUID();
	const tenantAId = crypto.randomUUID();
	const tenantBId = crypto.randomUUID();
	const userAlphaId = crypto.randomUUID();
	const userBetaId = crypto.randomUUID();
	const userTenantBId = crypto.randomUUID();

	let key1Id = "";
	let key2Id = "";
	let key3Id = "";

	beforeAll(async () => {
		await dr.insert(countriesTable).values([
			{ id: countryAId, name: "ApiKey Testland A" },
			{ id: countryBId, name: "ApiKey Testland B" },
		]);

		await dr.insert(countryAccountsTable).values([
			{
				id: tenantAId,
				shortDescription: "API Key Tenant A",
				countryId: countryAId,
				status: 1,
				type: "Official",
			},
			{
				id: tenantBId,
				shortDescription: "API Key Tenant B",
				countryId: countryBId,
				status: 1,
				type: "Official",
			},
		]);

		await dr.insert(userTable).values([
			{
				id: userAlphaId,
				firstName: "Anna",
				lastName: "Charles",
				email: "anna.charles@ihsi.ht",
				emailVerified: true,
			},
			{
				id: userBetaId,
				firstName: "Marie",
				lastName: "Joseph",
				email: "marie.joseph@dgpc.gouv.ht",
				emailVerified: true,
			},
			{
				id: userTenantBId,
				firstName: "Other",
				lastName: "Admin",
				email: "other@tenantb.org",
				emailVerified: true,
			},
		]);

		const inserted = await dr
			.insert(apiKeyTable)
			.values([
				{
					name: "Red Cross field app",
					secret: `secret_rc_${crypto.randomUUID()}`,
					managedByUserId: userBetaId,
					countryAccountsId: tenantAId,
					createdAt: new Date("2026-06-22T10:00:00Z"),
				},
				{
					name: "Early warning dashboard",
					secret: `secret_ew_${crypto.randomUUID()}`,
					managedByUserId: userAlphaId,
					countryAccountsId: tenantAId,
					createdAt: new Date("2026-08-04T10:00:00Z"),
				},
				{
					name: "National statistics sync",
					secret: `secret_ns_${crypto.randomUUID()}`,
					managedByUserId: userAlphaId,
					countryAccountsId: tenantAId,
					createdAt: new Date("2026-09-18T10:00:00Z"),
				},
				{
					name: "Other Tenant Key",
					secret: `secret_tb_${crypto.randomUUID()}`,
					managedByUserId: userTenantBId,
					countryAccountsId: tenantBId,
					createdAt: new Date("2026-10-01T10:00:00Z"),
				},
			])
			.returning({ id: apiKeyTable.id, name: apiKeyTable.name });

		key1Id = inserted.find((k) => k.name === "Red Cross field app")!.id;
		key2Id = inserted.find((k) => k.name === "Early warning dashboard")!.id;
		key3Id = inserted.find((k) => k.name === "National statistics sync")!.id;
	});

	afterAll(async () => {
		await dr
			.delete(apiKeyTable)
			.where(eq(apiKeyTable.countryAccountsId, tenantAId));
		await dr
			.delete(apiKeyTable)
			.where(eq(apiKeyTable.countryAccountsId, tenantBId));
		await dr.delete(userTable).where(eq(userTable.id, userAlphaId));
		await dr.delete(userTable).where(eq(userTable.id, userBetaId));
		await dr.delete(userTable).where(eq(userTable.id, userTenantBId));
		await dr
			.delete(countryAccountsTable)
			.where(eq(countryAccountsTable.id, tenantAId));
		await dr
			.delete(countryAccountsTable)
			.where(eq(countryAccountsTable.id, tenantBId));
		await dr.delete(countriesTable).where(eq(countriesTable.id, countryAId));
		await dr.delete(countriesTable).where(eq(countriesTable.id, countryBId));
	});

	it("scopes listing to countryAccountsId and defaults to created desc", async () => {
		const res = await ApiKeyRepository.listByCountryAccountsId(tenantAId, {
			page: 1,
			pageSize: 25,
			sort: "created",
			dir: "desc",
		});

		expect(res.total).toBe(3);
		expect(res.items.map((r) => r.name)).toEqual([
			"National statistics sync",
			"Early warning dashboard",
			"Red Cross field app",
		]);
		expect(res.items[0]?.managedByUser.email).toBe("anna.charles@ihsi.ht");
		expect(res.existingNames).toHaveLength(3);
		expect(res.existingNames).not.toContain("Other Tenant Key");
	});

	it("sorts by name asc and desc case-insensitively", async () => {
		const ascRes = await ApiKeyRepository.listByCountryAccountsId(tenantAId, {
			page: 1,
			pageSize: 25,
			sort: "name",
			dir: "asc",
		});
		expect(ascRes.items.map((r) => r.name)).toEqual([
			"Early warning dashboard",
			"National statistics sync",
			"Red Cross field app",
		]);

		const descRes = await ApiKeyRepository.listByCountryAccountsId(tenantAId, {
			page: 1,
			pageSize: 25,
			sort: "name",
			dir: "desc",
		});
		expect(descRes.items.map((r) => r.name)).toEqual([
			"Red Cross field app",
			"National statistics sync",
			"Early warning dashboard",
		]);
	});

	it("sorts by managedBy email asc and desc", async () => {
		const ascRes = await ApiKeyRepository.listByCountryAccountsId(tenantAId, {
			page: 1,
			pageSize: 25,
			sort: "managedBy",
			dir: "asc",
		});
		expect(ascRes.items[2]?.managedByUser.email).toBe(
			"marie.joseph@dgpc.gouv.ht",
		);

		const descRes = await ApiKeyRepository.listByCountryAccountsId(tenantAId, {
			page: 1,
			pageSize: 25,
			sort: "managedBy",
			dir: "desc",
		});
		expect(descRes.items[0]?.managedByUser.email).toBe(
			"marie.joseph@dgpc.gouv.ht",
		);
	});

	it("paginates results while preserving full-list total and existingNames", async () => {
		const page1 = await ApiKeyRepository.listByCountryAccountsId(tenantAId, {
			page: 1,
			pageSize: 2,
			sort: "name",
			dir: "asc",
		});
		expect(page1.total).toBe(3);
		expect(page1.items.map((r) => r.name)).toEqual([
			"Early warning dashboard",
			"National statistics sync",
		]);
		expect(page1.existingNames).toHaveLength(3);

		const page2 = await ApiKeyRepository.listByCountryAccountsId(tenantAId, {
			page: 2,
			pageSize: 2,
			sort: "name",
			dir: "asc",
		});
		expect(page2.total).toBe(3);
		expect(page2.page).toBe(2);
		expect(page2.items.map((r) => r.name)).toEqual(["Red Cross field app"]);
		expect(page2.existingNames).toHaveLength(3);

		const clamped = await ApiKeyRepository.listByCountryAccountsId(tenantAId, {
			page: 99,
			pageSize: 2,
			sort: "name",
			dir: "asc",
		});
		expect(clamped.page).toBe(2);
		expect(clamped.items.map((r) => r.name)).toEqual(["Red Cross field app"]);
	});

	it("checks duplicate names case-insensitively within tenant and respects excludeId", async () => {
		expect(
			await ApiKeyRepository.existsByNameInTenant(
				tenantAId,
				"  early warning dashboard  ",
			),
		).toBe(true);

		expect(
			await ApiKeyRepository.existsByNameInTenant(
				tenantAId,
				"Early warning dashboard",
				key2Id,
			),
		).toBe(false);

		expect(
			await ApiKeyRepository.existsByNameInTenant(
				tenantAId,
				"Early warning dashboard",
				key1Id,
			),
		).toBe(true);

		expect(
			await ApiKeyRepository.existsByNameInTenant(
				tenantAId,
				"Other Tenant Key",
			),
		).toBe(false);

		expect(key3Id).toBeTruthy();
	});

	it("returns id, name, and generated secret from create()", async () => {
		const created = await ApiKeyRepository.create({
			name: "Created Reveal Key",
			managedByUserId: userAlphaId,
			countryAccountsId: tenantAId,
		});

		expect(created).toHaveLength(1);
		expect(created[0]?.id).toBeTruthy();
		expect(created[0]?.name).toBe("Created Reveal Key");
		expect(created[0]?.secret).toMatch(/^[a-f0-9]{64}$/);

		await ApiKeyRepository.delete(created[0]!.id);
	});
});
