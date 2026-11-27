import "../db/setup";
import { describe, it, expect, beforeAll } from "vitest";
import { RouterContextProvider } from "react-router";
import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema/userTable";
import { apiKeyTable } from "../db/testSchema/apiKeyTable";
import { initCookieStorage } from "~/utils/session";
import { apiAuth } from "~/backend.server/models/api_key";
import { ApiKeyRepository } from "~/db/queries/apiKeyRepository";
import { CountryAccountsRepository } from "~/db/queries/countryAccountsRepository";
import { passwordHash } from "~/utils/passwordUtil";
import {
	buildSessionCookie,
	insertTenant,
	insertUser,
} from "../domains/notices/testHelpers";
import { loader as apiKeyEditLoader } from "~/routes/$lang+/settings+/api-key+/edit.$id";
import { loader as apiKeyDeleteLoader } from "~/routes/$lang+/settings+/api-key+/delete.$id";
import { action as systemSettingsAction } from "~/routes/$lang+/settings+/system";
import { userCountryAccounts } from "../db/testSchema/userCountryAccounts";

function makeLoaderArgs(
	url: string,
	params: Record<string, string>,
	cookie?: string,
) {
	const headers: HeadersInit = cookie ? { Cookie: cookie } : {};
	return {
		request: new Request(url, { headers }),
		params: { lang: "en", ...params },
		context: new RouterContextProvider(),
		unstable_pattern: url,
	} as any;
}

describe("API access control and loader projections", () => {
	beforeAll(() => {
		initCookieStorage();
	});

	it("apiAuth returns 401 when X-Auth header does not match a stored key", async () => {
		const req = new Request("http://localhost:3000/en/api/disaster-event", {
			headers: { "X-Auth": "non-existent-api-key" },
		});

		let thrown: unknown;
		try {
			await apiAuth(req);
		} catch (e) {
			thrown = e;
		}
		expect(thrown).toBeInstanceOf(Response);
		expect((thrown as Response).status).toBe(401);
	});

	it("ApiKeyRepository and CountryAccountsRepository project only safe user columns", async () => {
		const tenantId = await insertTenant();
		const [admin] = await dr
			.insert(userTable)
			.values({
				email: `admin-secret-${crypto.randomUUID()}@example.com`,
				password: passwordHash("SuperSecretPassword!1"),
				totpSecret: "BASE32TOTPSECRET",
				totpSecretUrl: "otpauth://totp/delta?secret=BASE32TOTPSECRET",
				resetPasswordToken: "secret-reset",
				inviteCode: "secret-invite",
				emailVerified: true,
			})
			.returning();

		await dr.insert(userCountryAccounts).values({
			userId: admin.id,
			countryAccountsId: tenantId,
			role: "admin",
			isPrimaryAdmin: true,
		});

		const [keyRow] = await dr
			.insert(apiKeyTable)
			.values({
				name: "Key 1",
				secret: `secret-${crypto.randomUUID()}`,
				managedByUserId: admin.id,
				countryAccountsId: tenantId,
			})
			.returning();

		const keys =
			await ApiKeyRepository.getByCountryAccountsIdWithUser(tenantId);
		expect(keys).toHaveLength(1);
		const managedUser = keys[0].managedByUser as Record<string, unknown>;
		expect(managedUser.email).toBe(admin.email);
		expect(managedUser.password).toBeUndefined();
		expect(managedUser.totpSecret).toBeUndefined();
		expect(managedUser.totpSecretUrl).toBeUndefined();
		expect(managedUser.resetPasswordToken).toBeUndefined();
		expect(managedUser.inviteCode).toBeUndefined();

		const accounts =
			await CountryAccountsRepository.getAllWithUserCountryAccountsAndUserPaginated(
				0,
				50,
			);
		const found = accounts.find((a) => a.id === tenantId);
		expect(found).toBeDefined();
		const primaryUser = found!.userCountryAccounts[0]?.user as Record<
			string,
			unknown
		>;
		expect(primaryUser.email).toBe(admin.email);
		expect(primaryUser.password).toBeUndefined();
		expect(primaryUser.totpSecret).toBeUndefined();
		expect(primaryUser.resetPasswordToken).toBeUndefined();
		expect(primaryUser.inviteCode).toBeUndefined();

		// API key edit loader returns 404 for keys outside the active tenant
		const otherTenantId = await insertTenant();
		const otherAdminId = await insertUser();
		const otherAdminCookie = await buildSessionCookie({
			userId: otherAdminId,
			tenantId: otherTenantId,
			role: "admin",
		});

		let thrownEdit: unknown;
		try {
			await apiKeyEditLoader(
				makeLoaderArgs(
					`http://localhost:3000/en/settings/api-key/edit/${keyRow.id}`,
					{ id: keyRow.id },
					otherAdminCookie,
				),
			);
		} catch (e) {
			thrownEdit = e;
		}
		expect(thrownEdit).toBeInstanceOf(Response);
		expect((thrownEdit as Response).status).toBe(404);

		// Same-tenant API key edit loader returns only { id, name } (no secret/managedByUser)
		const sameAdminCookie = await buildSessionCookie({
			userId: admin.id,
			tenantId,
			role: "admin",
			skipMembership: true,
		});
		const editData = (await apiKeyEditLoader(
			makeLoaderArgs(
				`http://localhost:3000/en/settings/api-key/edit/${keyRow.id}`,
				{ id: keyRow.id },
				sameAdminCookie,
			),
		)) as any;
		expect(editData.item).toEqual({ id: keyRow.id, name: "Key 1" });
		expect(editData.item.secret).toBeUndefined();
		expect(editData.item.managedByUser).toBeUndefined();

		// API key delete loader requires EditAPIKeys auth even without session (not public)
		let thrownDelete: unknown;
		try {
			await apiKeyDeleteLoader(
				makeLoaderArgs(
					`http://localhost:3000/en/settings/api-key/delete/${keyRow.id}`,
					{ id: keyRow.id },
				),
			);
		} catch (e) {
			thrownDelete = e;
		}
		expect(thrownDelete).toBeInstanceOf(Response);
		expect((thrownDelete as Response).status).toBe(302);
	});

	it("settings/system action returns 403 for non-admin roles", async () => {
		const tenantId = await insertTenant();
		const collectorId = await insertUser();
		const collectorCookie = await buildSessionCookie({
			userId: collectorId,
			tenantId,
			role: "data-collector",
		});

		const formData = new FormData();
		formData.append("id", crypto.randomUUID());
		formData.append("instanceName", "Updated");
		formData.append("language", "en");

		let thrown: unknown;
		try {
			await systemSettingsAction({
				request: new Request("http://localhost:3000/en/settings/system", {
					method: "POST",
					headers: { Cookie: collectorCookie },
					body: formData,
				}),
				params: { lang: "en" },
				context: new RouterContextProvider(),
				unstable_pattern: "/:lang/settings/system",
			} as any);
		} catch (e) {
			thrown = e;
		}
		expect(thrown).toBeInstanceOf(Response);
		expect((thrown as Response).status).toBe(403);
	});
});
