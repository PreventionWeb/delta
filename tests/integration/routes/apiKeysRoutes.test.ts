import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import { apiKeyTable, countryAccountsTable, userTable } from "~/drizzle/schema";
import { countriesTable } from "../db/testSchema";

const mockSessionState = {
	userId: "",
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
			return fn({
				...args,
				userSession: {
					user: { id: mockSessionState.userId, role: mockSessionState.role },
				},
			});
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
			return fn({
				...args,
				userSession: {
					user: { id: mockSessionState.userId, role: mockSessionState.role },
				},
			});
		},
	authActionGetAuth: () => ({
		user: { id: mockSessionState.userId, role: mockSessionState.role },
	}),
}));

vi.mock("~/utils/session", () => ({
	getCountryAccountsIdFromSession: async () =>
		mockSessionState.countryAccountsId,
	redirectWithMessage: (_args: any, url: string) =>
		new Response(null, { status: 302, headers: { Location: url } }),
}));

import { parseApiKeysQuery } from "~/routes/$lang+/settings+/api-key+/_layout";
import { action as newAction } from "~/routes/$lang+/settings+/api-key+/new";
import {
	action as editAction,
	loader as editLoader,
} from "~/routes/$lang+/settings+/api-key+/edit.$id";
import {
	action as deleteAction,
	loader as deleteLoader,
} from "~/routes/$lang+/settings+/api-key+/delete.$id";

function makeFetcherFormRequest(url: string, fields: Record<string, string>) {
	const formData = new FormData();
	formData.set("_fetcher", "1");
	for (const [k, v] of Object.entries(fields)) {
		formData.set(k, v);
	}
	return new Request(url, {
		method: "POST",
		body: formData,
	});
}

describe("API keys route loaders and actions", () => {
	const countryAId = crypto.randomUUID();
	const countryBId = crypto.randomUUID();
	const tenantAId = crypto.randomUUID();
	const tenantBId = crypto.randomUUID();
	const userAId = crypto.randomUUID();
	const userBId = crypto.randomUUID();

	let keyA1Id = "";
	let keyA2Id = "";
	let keyB1Id = "";

	beforeAll(async () => {
		if (typeof globalThis.createTranslationGetter !== "function") {
			(globalThis as any).createTranslationGetter =
				() => (p: { msg?: string; msgs?: Record<string, string> }) =>
					p;
		}
		await dr.insert(countriesTable).values([
			{ id: countryAId, name: "Route Testland A" },
			{ id: countryBId, name: "Route Testland B" },
		]);
		await dr.insert(countryAccountsTable).values([
			{
				id: tenantAId,
				shortDescription: "Route Tenant A",
				countryId: countryAId,
				status: 1,
				type: "Official",
			},
			{
				id: tenantBId,
				shortDescription: "Route Tenant B",
				countryId: countryBId,
				status: 1,
				type: "Official",
			},
		]);
		await dr.insert(userTable).values([
			{
				id: userAId,
				firstName: "Admin",
				lastName: "A",
				email: "admin-a@example.org",
				emailVerified: true,
			},
			{
				id: userBId,
				firstName: "Admin",
				lastName: "B",
				email: "admin-b@example.org",
				emailVerified: true,
			},
		]);

		const inserted = await dr
			.insert(apiKeyTable)
			.values([
				{
					name: "Existing Key One",
					secret: `sec_1_${crypto.randomUUID()}`,
					managedByUserId: userAId,
					countryAccountsId: tenantAId,
				},
				{
					name: "Existing Key Two",
					secret: `sec_2_${crypto.randomUUID()}`,
					managedByUserId: userAId,
					countryAccountsId: tenantAId,
				},
				{
					name: "Tenant B Key",
					secret: `sec_b_${crypto.randomUUID()}`,
					managedByUserId: userBId,
					countryAccountsId: tenantBId,
				},
			])
			.returning({ id: apiKeyTable.id, name: apiKeyTable.name });

		keyA1Id = inserted.find((k) => k.name === "Existing Key One")!.id;
		keyA2Id = inserted.find((k) => k.name === "Existing Key Two")!.id;
		keyB1Id = inserted.find((k) => k.name === "Tenant B Key")!.id;

		mockSessionState.userId = userAId;
		mockSessionState.countryAccountsId = tenantAId;
		mockSessionState.allowAuth = true;
	});

	afterAll(async () => {
		await dr
			.delete(apiKeyTable)
			.where(eq(apiKeyTable.countryAccountsId, tenantAId));
		await dr
			.delete(apiKeyTable)
			.where(eq(apiKeyTable.countryAccountsId, tenantBId));
		await dr.delete(userTable).where(eq(userTable.id, userAId));
		await dr.delete(userTable).where(eq(userTable.id, userBId));
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
			parseApiKeysQuery(new URL("http://localhost:3000/en/settings/api-key")),
		).toEqual({
			sort: "created",
			dir: "desc",
			page: 1,
			pageSize: 25,
		});

		expect(
			parseApiKeysQuery(
				new URL(
					"http://localhost:3000/en/settings/api-key?sort=managedBy&dir=asc&page=3&pageSize=50",
				),
			),
		).toEqual({
			sort: "managedBy",
			dir: "asc",
			page: 3,
			pageSize: 50,
		});

		expect(
			parseApiKeysQuery(
				new URL(
					"http://localhost:3000/en/settings/api-key?sort=invalid&dir=sideways&page=0&pageSize=999",
				),
			),
		).toEqual({
			sort: "created",
			dir: "desc",
			page: 1,
			pageSize: 25,
		});
	});

	it("rejects empty and duplicate names in new.tsx and returns { ok: true, key } on create", async () => {
		const emptyRes = (await newAction({
			request: makeFetcherFormRequest(
				"http://localhost:3000/en/settings/api-key/new",
				{ name: "   " },
			),
			params: { lang: "en" },
			context: {},
		} as any)) as Response;
		expect(emptyRes.status).toBe(400);
		expect(await emptyRes.json()).toEqual({
			ok: false,
			fieldErrors: { name: "Enter a name." },
		});

		const dupRes = (await newAction({
			request: makeFetcherFormRequest(
				"http://localhost:3000/en/settings/api-key/new",
				{ name: "existing key one" },
			),
			params: { lang: "en" },
			context: {},
		} as any)) as Response;
		expect(dupRes.status).toBe(409);
		expect(await dupRes.json()).toEqual({
			ok: false,
			fieldErrors: { name: "A key with this name already exists." },
		});

		const okRes = (await newAction({
			request: makeFetcherFormRequest(
				"http://localhost:3000/en/settings/api-key/new",
				{ name: "Brand New Key" },
			),
			params: { lang: "en" },
			context: {},
		} as any)) as Response;
		expect(okRes.status).toBe(200);
		const body = await okRes.json();
		expect(body.ok).toBe(true);
		expect(body.key.name).toBe("Brand New Key");
		expect(body.key.secret).toMatch(/^[a-f0-9]{64}$/);
	});

	it("enforces tenant check in edit.$id.tsx loader and duplicate check in action", async () => {
		await expect(
			editLoader({
				request: new Request(
					"http://localhost:3000/en/settings/api-key/edit/not-a-uuid",
				),
				params: { lang: "en", id: "not-a-uuid" },
				context: {},
			} as any),
		).rejects.toMatchObject({ status: 404 });

		await expect(
			editLoader({
				request: new Request(
					`http://localhost:3000/en/settings/api-key/edit/${keyB1Id}`,
				),
				params: { lang: "en", id: keyB1Id },
				context: {},
			} as any),
		).rejects.toMatchObject({ status: 404 });

		const dupRes = (await editAction({
			request: makeFetcherFormRequest(
				`http://localhost:3000/en/settings/api-key/edit/${keyA1Id}`,
				{ name: "EXISTING KEY TWO" },
			),
			params: { lang: "en", id: keyA1Id },
			context: {},
		} as any)) as Response;
		expect(dupRes.status).toBe(409);
		expect(await dupRes.json()).toEqual({
			ok: false,
			fieldErrors: { name: "A key with this name already exists." },
		});

		const okRes = (await editAction({
			request: makeFetcherFormRequest(
				`http://localhost:3000/en/settings/api-key/edit/${keyA1Id}`,
				{ name: "Renamed Key One" },
			),
			params: { lang: "en", id: keyA1Id },
			context: {},
		} as any)) as Response;
		expect(okRes.status).toBe(200);
		expect(await okRes.json()).toEqual({ ok: true });
	});

	it("enforces authLoaderWithPerm and tenant isolation in delete.$id.tsx", async () => {
		mockSessionState.allowAuth = false;
		await expect(
			deleteLoader({
				request: new Request(
					`http://localhost:3000/en/settings/api-key/delete/${keyA2Id}`,
				),
				params: { lang: "en", id: keyA2Id },
				context: {},
			} as any),
		).rejects.toMatchObject({ status: 401 });
		mockSessionState.allowAuth = true;

		await expect(
			deleteLoader({
				request: new Request(
					`http://localhost:3000/en/settings/api-key/delete/${keyB1Id}`,
				),
				params: { lang: "en", id: keyB1Id },
				context: {},
			} as any),
		).rejects.toMatchObject({ status: 404 });

		const okRes = (await deleteAction({
			request: makeFetcherFormRequest(
				`http://localhost:3000/en/settings/api-key/delete/${keyA2Id}`,
				{},
			),
			params: { lang: "en", id: keyA2Id },
			context: {},
		} as any)) as Response;
		expect(okRes.status).toBe(200);
		expect(await okRes.json()).toEqual({ ok: true });
	});
});
