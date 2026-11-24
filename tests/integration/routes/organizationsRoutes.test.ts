import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import {
	countryAccountsTable,
	organizationTable,
	userCountryAccountsTable,
	userTable,
} from "~/drizzle/schema";
import { countriesTable } from "../db/testSchema";

const mockSessionState = {
	countryAccountsId: "",
	role: "admin",
	allowAuth: true,
};

vi.mock("~/utils/auth", () => ({
	authLoaderWithPerm:
		(_perm: string, fn: (args: any) => Promise<any>) => async (args: any) => {
			if (!mockSessionState.allowAuth) {
				throw new Response("Unauthorized", { status: 401 });
			}
			return fn(args);
		},
	authLoaderPublicOrWithPerm:
		(_perm: string, fn: (args: any) => Promise<any>) => async (args: any) => {
			return fn(args);
		},
	authActionWithPerm:
		(_perm: string, fn: (args: any) => Promise<any>) => async (args: any) => {
			if (!mockSessionState.allowAuth) {
				throw new Response("Unauthorized", { status: 401 });
			}
			return fn(args);
		},
}));

vi.mock("~/utils/session", () => ({
	getCountryAccountsIdFromSession: async () =>
		mockSessionState.countryAccountsId,
	getUserRoleFromSession: async () => mockSessionState.role,
	redirectWithMessage: (_args: any, url: string) =>
		new Response(null, { status: 302, headers: { Location: url } }),
}));

import {
	loader as layoutLoader,
	parseOrganizationsQuery,
} from "~/routes/$lang+/settings+/organizations+/_layout";
import { action as newAction } from "~/routes/$lang+/settings+/organizations+/new";
import {
	action as editAction,
	loader as editLoader,
} from "~/routes/$lang+/settings+/organizations+/edit.$id";
import {
	action as deleteAction,
	loader as deleteLoader,
} from "~/routes/$lang+/settings+/organizations+/delete.$id";

function makeFetcherPost(url: string, fields: Record<string, string>) {
	const formData = new FormData();
	formData.set("_fetcher", "1");
	for (const [k, v] of Object.entries(fields)) {
		formData.set(k, v);
	}
	return new Request(url, { method: "POST", body: formData });
}

describe("Organizations route loaders and actions", () => {
	const countryAId = crypto.randomUUID();
	const countryBId = crypto.randomUUID();
	const tenantAId = crypto.randomUUID();
	const tenantBId = crypto.randomUUID();

	let orgA1Id = "";
	let orgA2Id = "";
	let orgB1Id = "";

	beforeAll(async () => {
		if (typeof globalThis.createTranslationGetter !== "function") {
			(globalThis as any).createTranslationGetter =
				() => (p: { msg?: string; msgs?: Record<string, string> }) =>
					p;
		}
		await dr.insert(countriesTable).values([
			{ id: countryAId, name: "Org Route Land A" },
			{ id: countryBId, name: "Org Route Land B" },
		]);
		await dr.insert(countryAccountsTable).values([
			{
				id: tenantAId,
				shortDescription: "Org Route Tenant A",
				countryId: countryAId,
				status: 1,
				type: "Official",
			},
			{
				id: tenantBId,
				shortDescription: "Org Route Tenant B",
				countryId: countryBId,
				status: 1,
				type: "Official",
			},
		]);

		const inserted = await dr
			.insert(organizationTable)
			.values([
				{ name: "DGPC Haiti", countryAccountsId: tenantAId },
				{ name: "Statistics Office", countryAccountsId: tenantAId },
				{ name: "Tenant B Org", countryAccountsId: tenantBId },
			])
			.returning({ id: organizationTable.id, name: organizationTable.name });

		orgA1Id = inserted.find((o) => o.name === "DGPC Haiti")!.id;
		orgA2Id = inserted.find((o) => o.name === "Statistics Office")!.id;
		orgB1Id = inserted.find((o) => o.name === "Tenant B Org")!.id;

		mockSessionState.countryAccountsId = tenantAId;
		mockSessionState.allowAuth = true;
	});

	afterAll(async () => {
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

	it("parses valid URL query params and falls back safely for invalid values", () => {
		expect(
			parseOrganizationsQuery(
				new URL("http://localhost:3000/en/settings/organizations"),
			),
		).toEqual({
			search: "",
			sort: "name",
			dir: "asc",
			page: 1,
			pageSize: 25,
		});

		expect(
			parseOrganizationsQuery(
				new URL(
					"http://localhost:3000/en/settings/organizations?search=DGPC&sort=users&dir=desc&page=2&pageSize=100",
				),
			),
		).toEqual({
			search: "DGPC",
			sort: "users",
			dir: "desc",
			page: 2,
			pageSize: 100,
		});

		expect(
			parseOrganizationsQuery(
				new URL(
					"http://localhost:3000/en/settings/organizations?sort=bad&dir=sideways&page=0&pageSize=999",
				),
			),
		).toEqual({
			search: "",
			sort: "name",
			dir: "asc",
			page: 1,
			pageSize: 25,
		});
	});

	it("enforces authLoaderWithPerm on _layout, edit, and delete loaders", async () => {
		mockSessionState.allowAuth = false;

		await expect(
			layoutLoader({
				request: new Request("http://localhost:3000/en/settings/organizations"),
				params: { lang: "en" },
				context: {},
			} as any),
		).rejects.toMatchObject({ status: 401 });

		await expect(
			editLoader({
				request: new Request(
					`http://localhost:3000/en/settings/organizations/edit/${orgA1Id}`,
				),
				params: { lang: "en", id: orgA1Id },
				context: {},
			} as any),
		).rejects.toMatchObject({ status: 401 });

		await expect(
			deleteLoader({
				request: new Request(
					`http://localhost:3000/en/settings/organizations/delete/${orgA1Id}`,
				),
				params: { lang: "en", id: orgA1Id },
				context: {},
			} as any),
		).rejects.toMatchObject({ status: 401 });

		mockSessionState.allowAuth = true;
	});

	it("returns JSON fetcher responses and validates duplicates in new.tsx, edit.$id.tsx, and delete.$id.tsx", async () => {
		const dupCreate = (await newAction({
			request: makeFetcherPost(
				"http://localhost:3000/en/settings/organizations/new",
				{ name: "dgpc haiti" },
			),
			params: { lang: "en" },
			context: {},
		} as any)) as Response;
		expect(dupCreate.status).toBe(400);
		expect(await dupCreate.json()).toMatchObject({
			ok: false,
			fieldErrors: { name: "An organization with this name already exists." },
		});

		const okCreate = (await newAction({
			request: makeFetcherPost(
				"http://localhost:3000/en/settings/organizations/new",
				{ name: "Red Cross Haiti" },
			),
			params: { lang: "en" },
			context: {},
		} as any)) as Response;
		expect(okCreate.status).toBe(200);
		expect(await okCreate.json()).toEqual({ ok: true, intent: "create" });

		await expect(
			editLoader({
				request: new Request(
					"http://localhost:3000/en/settings/organizations/edit/not-a-uuid",
				),
				params: { lang: "en", id: "not-a-uuid" },
				context: {},
			} as any),
		).rejects.toMatchObject({ status: 404 });

		await expect(
			editLoader({
				request: new Request(
					`http://localhost:3000/en/settings/organizations/edit/${orgB1Id}`,
				),
				params: { lang: "en", id: orgB1Id },
				context: {},
			} as any),
		).rejects.toMatchObject({ status: 404 });

		const okEdit = (await editAction({
			request: makeFetcherPost(
				`http://localhost:3000/en/settings/organizations/edit/${orgA1Id}`,
				{ name: "DGPC National" },
			),
			params: { lang: "en", id: orgA1Id },
			context: {},
		} as any)) as Response;
		expect(okEdit.status).toBe(200);
		expect(await okEdit.json()).toEqual({ ok: true, intent: "update" });

		const okDelete = (await deleteAction({
			request: makeFetcherPost(
				`http://localhost:3000/en/settings/organizations/delete/${orgA2Id}`,
				{},
			),
			params: { lang: "en", id: orgA2Id },
			context: {},
		} as any)) as Response;
		expect(okDelete.status).toBe(200);
		expect(await okDelete.json()).toEqual({ ok: true, intent: "delete" });

		// Cross-tenant edit/delete actions return 404
		await expect(
			editAction({
				request: makeFetcherPost(
					`http://localhost:3000/en/settings/organizations/edit/${orgB1Id}`,
					{ name: "Hijack" },
				),
				params: { lang: "en", id: orgB1Id },
				context: {},
			} as any),
		).rejects.toMatchObject({ status: 404 });

		await expect(
			deleteAction({
				request: makeFetcherPost(
					`http://localhost:3000/en/settings/organizations/delete/${orgB1Id}`,
					{},
				),
				params: { lang: "en", id: orgB1Id },
				context: {},
			} as any),
		).rejects.toMatchObject({ status: 404 });

		// Concurrent FK 23503 delete block returns 400 JSON without crashing
		const assignedUserId = crypto.randomUUID();
		await dr.insert(userTable).values({
			id: assignedUserId,
			firstName: "Assigned",
			lastName: "User",
			email: `org_fk_${Date.now()}@example.org`,
			emailVerified: true,
		});
		await dr.insert(userCountryAccountsTable).values({
			userId: assignedUserId,
			countryAccountsId: tenantAId,
			role: "data-viewer",
			isPrimaryAdmin: false,
			organizationId: orgA1Id,
		});

		try {
			const blockedDelete = (await deleteAction({
				request: makeFetcherPost(
					`http://localhost:3000/en/settings/organizations/delete/${orgA1Id}`,
					{},
				),
				params: { lang: "en", id: orgA1Id },
				context: {},
			} as any)) as Response;
			expect(blockedDelete.status).toBe(400);
			const blockedBody = await blockedDelete.json();
			expect(blockedBody.ok).toBe(false);
			expect(blockedBody.error).toContain("cannot be deleted");
		} finally {
			await dr
				.delete(userCountryAccountsTable)
				.where(eq(userCountryAccountsTable.userId, assignedUserId));
			await dr.delete(userTable).where(eq(userTable.id, assignedUserId));
		}
	});
});
