import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import {
	countryAccountsTable,
	instanceSystemSettingsTable,
} from "~/drizzle/schema";
import { countriesTable } from "../db/testSchema";

const { authCalls, mockSessionState } = vi.hoisted(() => ({
	authCalls: [] as Array<{ kind: "loader" | "action"; perm: string }>,
	mockSessionState: {
		countryAccountsId: "",
		role: "admin",
		allowManageCountrySettings: true,
	},
}));

vi.mock("~/utils/auth", () => ({
	authLoaderWithPerm: (perm: string, fn: (args: any) => Promise<any>) => {
		authCalls.push({ kind: "loader", perm });
		return async (args: any) => {
			if (
				perm === "ManageCountrySettings" &&
				!mockSessionState.allowManageCountrySettings
			) {
				throw new Response("Forbidden", { status: 403 });
			}
			return fn(args);
		};
	},
	authActionWithPerm: (perm: string, fn: (args: any) => Promise<any>) => {
		authCalls.push({ kind: "action", perm });
		return async (args: any) => {
			if (
				perm === "ManageCountrySettings" &&
				!mockSessionState.allowManageCountrySettings
			) {
				throw new Response("Forbidden", { status: 403 });
			}
			return fn(args);
		};
	},
}));

vi.mock("~/utils/session", () => ({
	getCountryAccountsIdFromSession: async () =>
		mockSessionState.countryAccountsId,
	getUserRoleFromSession: async () => mockSessionState.role,
}));

vi.mock("~/db/queries/countriesRepository", () => ({
	CountryRepository: {
		getById: async (id: string) => ({ id, name: "Haiti" }),
	},
}));

import {
	action as systemAction,
	handle as systemHandle,
	loader as systemLoader,
} from "~/routes/$lang+/settings+/system";

function makePost(fields: Record<string, string>) {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) {
		formData.set(k, v);
	}
	return new Request("http://localhost:3000/en/settings/system", {
		method: "POST",
		body: formData,
	});
}

describe("System settings route loader and action", () => {
	const countryAId = crypto.randomUUID();
	const countryBId = crypto.randomUUID();
	const tenantAId = crypto.randomUUID();
	const tenantBId = crypto.randomUUID();
	let settingsBId = "";

	beforeAll(async () => {
		if (typeof globalThis.createTranslationGetter !== "function") {
			(globalThis as any).createTranslationGetter =
				() => (p: { msg?: string; msgs?: Record<string, string> }) =>
					p;
		}
		await dr.insert(countriesTable).values([
			{ id: countryAId, name: "Route Land A" },
			{ id: countryBId, name: "Route Land B" },
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
				type: "Training",
			},
		]);

		const inserted = await dr
			.insert(instanceSystemSettingsTable)
			.values([
				{
					countryAccountsId: tenantAId,
					websiteName: "Route Tenant A",
					language: "en",
					currencyCode: "USD",
					dtsInstanceCtryIso3: "USA",
					totpIssuer: "DELTA A",
				},
				{
					countryAccountsId: tenantBId,
					websiteName: "Route Tenant B",
					language: "fr",
					currencyCode: "HTG",
					dtsInstanceCtryIso3: "HTI",
					totpIssuer: "DELTA B",
				},
			])
			.returning({
				id: instanceSystemSettingsTable.id,
				countryAccountsId: instanceSystemSettingsTable.countryAccountsId,
			});

		settingsBId = inserted.find((r) => r.countryAccountsId === tenantBId)!.id;
		mockSessionState.countryAccountsId = tenantAId;
		mockSessionState.allowManageCountrySettings = true;
	});

	afterAll(async () => {
		await dr
			.delete(instanceSystemSettingsTable)
			.where(eq(instanceSystemSettingsTable.countryAccountsId, tenantAId));
		await dr
			.delete(instanceSystemSettingsTable)
			.where(eq(instanceSystemSettingsTable.countryAccountsId, tenantBId));
		await dr
			.delete(countryAccountsTable)
			.where(eq(countryAccountsTable.id, tenantAId));
		await dr
			.delete(countryAccountsTable)
			.where(eq(countryAccountsTable.id, tenantBId));
		await dr.delete(countriesTable).where(eq(countriesTable.id, countryAId));
		await dr.delete(countriesTable).where(eq(countriesTable.id, countryBId));
	});

	it("exports useDesignSystemCanvas handle and guards both loader and action with ManageCountrySettings", () => {
		expect(systemHandle).toEqual({ useDesignSystemCanvas: true });
		expect(authCalls).toContainEqual({
			kind: "loader",
			perm: "ManageCountrySettings",
		});
		expect(authCalls).toContainEqual({
			kind: "action",
			perm: "ManageCountrySettings",
		});
	});

	it("rejects action POST when ManageCountrySettings permission is missing", async () => {
		mockSessionState.allowManageCountrySettings = false;
		try {
			await expect(
				systemAction({
					request: makePost({ instanceName: "Hacked", language: "en" }),
					params: { lang: "en" },
					context: {},
				} as any),
			).rejects.toBeInstanceOf(Response);
		} finally {
			mockSessionState.allowManageCountrySettings = true;
		}
	});

	it("updates active tenant settings and ignores tampered cross-tenant id", async () => {
		const res = (await systemAction({
			request: makePost({
				id: settingsBId,
				instanceName: "DGPC Haiti Updated",
				language: "en",
			}),
			params: { lang: "en" },
			context: {},
		} as any)) as Response;

		expect(res).toBeInstanceOf(Response);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });

		const loadedA = (await systemLoader({
			request: new Request("http://localhost:3000/en/settings/system"),
			params: { lang: "en" },
			context: {},
		} as any)) as any;
		expect(loadedA.instanceSystemSettings?.websiteName).toBe(
			"DGPC Haiti Updated",
		);

		mockSessionState.countryAccountsId = tenantBId;
		try {
			const loadedB = (await systemLoader({
				request: new Request("http://localhost:3000/en/settings/system"),
				params: { lang: "en" },
				context: {},
			} as any)) as any;
			expect(loadedB.instanceSystemSettings?.websiteName).toBe(
				"Route Tenant B",
			);
		} finally {
			mockSessionState.countryAccountsId = tenantAId;
		}
	});

	it("returns 400 with fieldErrors when instanceName is empty or exceeds 50 characters", async () => {
		const emptyRes = (await systemAction({
			request: makePost({ instanceName: "   ", language: "en" }),
			params: { lang: "en" },
			context: {},
		} as any)) as Response;
		expect(emptyRes.status).toBe(400);
		const emptyJson = await emptyRes.json();
		expect(emptyJson.ok).toBe(false);
		expect(emptyJson.fieldErrors?.instanceName).toBeTruthy();

		const longRes = (await systemAction({
			request: makePost({ instanceName: "X".repeat(51), language: "en" }),
			params: { lang: "en" },
			context: {},
		} as any)) as Response;
		expect(longRes.status).toBe(400);
		const longJson = await longRes.json();
		expect(longJson.ok).toBe(false);
		expect(longJson.fieldErrors?.instanceName).toBeTruthy();
	});
});
