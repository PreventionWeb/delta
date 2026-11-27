import "../db/setup";
import { describe, it, expect, beforeAll } from "vitest";
import { RouterContextProvider } from "react-router";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema/userTable";
import { apiKeyTable } from "../db/testSchema/apiKeyTable";
import { disasterRecordsTable } from "../db/testSchema/disasterRecordsTable";
import { instanceSystemSettingsTable } from "../db/testSchema/instanceSystemSettingsTable";
import {
	countryAccounts,
	countryAccountStatuses,
} from "../db/testSchema/countryAccounts";
import { initCookieStorage, sessionCookie } from "~/utils/session";
import { apiAuth } from "~/backend.server/models/api_key";
import { ApiKeyRepository } from "~/db/queries/apiKeyRepository";
import { CountryAccountsRepository } from "~/db/queries/countryAccountsRepository";
import { passwordHash } from "~/utils/passwordUtil";
import { createTranslationGetter } from "~/backend.server/translations";
import {
	buildSessionCookie,
	insertTenant,
	insertUser,
} from "../domains/notices/testHelpers";
import { loader as apiKeyEditLoader } from "~/routes/$lang+/settings+/api-key+/edit.$id";
import { loader as apiKeyDeleteLoader } from "~/routes/$lang+/settings+/api-key+/delete.$id";
import { action as systemSettingsAction } from "~/routes/$lang+/settings+/system";
import { loader as spatialFootprintLoader } from "~/routes/$lang+/api+/spatial-footprint-geojson";
import { loader as adminLoginLoader } from "~/routes/$lang+/admin+/login";
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
		globalThis.createTranslationGetter = createTranslationGetter;
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

	it("spatial-footprint-geojson enforces publication status, tenant scope, live public flag, and active tenant status", async () => {
		const tenantA = await insertTenant();
		const tenantB = await insertTenant();
		const divisionId = "div-100";

		const sampleFootprint = [
			{
				geojson: {
					type: "Feature",
					properties: { division_id: divisionId },
					geometry: { type: "Point", coordinates: [35.9, 31.9] },
				},
			},
		];

		await dr.insert(instanceSystemSettingsTable).values([
			{
				countryAccountsId: tenantA,
				approvedRecordsArePublic: true,
			},
			{
				countryAccountsId: tenantB,
				approvedRecordsArePublic: true,
			},
		]);

		const [publishedA] = await dr
			.insert(disasterRecordsTable)
			.values({
				countryAccountsId: tenantA,
				approvalStatus: "published",
				spatialFootprint: sampleFootprint,
			})
			.returning({ id: disasterRecordsTable.id });

		const [draftA] = await dr
			.insert(disasterRecordsTable)
			.values({
				countryAccountsId: tenantA,
				approvalStatus: "draft",
				spatialFootprint: sampleFootprint,
			})
			.returning({ id: disasterRecordsTable.id });

		const [publishedB] = await dr
			.insert(disasterRecordsTable)
			.values({
				countryAccountsId: tenantB,
				approvalStatus: "published",
				spatialFootprint: sampleFootprint,
			})
			.returning({ id: disasterRecordsTable.id });

		// Anonymous cookie selecting tenantA with public records enabled
		const anonSession = await sessionCookie().getSession();
		anonSession.set("countryAccountsId", tenantA);
		anonSession.set("countrySettings", { approvedRecordsArePublic: true });
		const anonCookie = (await sessionCookie().commitSession(anonSession)).split(
			";",
		)[0];

		// 1. Public visitor CAN read published record for selected public tenant
		const pubRes = await spatialFootprintLoader(
			makeLoaderArgs(
				`http://localhost:3000/en/api/spatial-footprint-geojson?division_id=${divisionId}&record_id=${publishedA.id}`,
				{},
				anonCookie,
			),
		);
		expect(pubRes.status).toBe(200);

		// 2. Public visitor CANNOT read draft (unpublished) record
		const draftRes = await spatialFootprintLoader(
			makeLoaderArgs(
				`http://localhost:3000/en/api/spatial-footprint-geojson?division_id=${divisionId}&record_id=${draftA.id}`,
				{},
				anonCookie,
			),
		);
		expect(draftRes.status).toBe(404);

		// 3. Public visitor CANNOT read another tenant's published record
		const foreignRes = await spatialFootprintLoader(
			makeLoaderArgs(
				`http://localhost:3000/en/api/spatial-footprint-geojson?division_id=${divisionId}&record_id=${publishedB.id}`,
				{},
				anonCookie,
			),
		);
		expect(foreignRes.status).toBe(404);

		// 4. Authenticated tenant member CAN read draft record in their own tenant
		const memberId = await insertUser();
		const memberCookie = await buildSessionCookie({
			userId: memberId,
			tenantId: tenantA,
			role: "data-viewer",
		});
		const authDraftRes = await spatialFootprintLoader(
			makeLoaderArgs(
				`http://localhost:3000/en/api/spatial-footprint-geojson?division_id=${divisionId}&record_id=${draftA.id}`,
				{},
				memberCookie,
			),
		);
		expect(authDraftRes.status).toBe(200);

		// 5. After tenant disables approvedRecordsArePublic in DB, stale public cookie is rejected
		await dr
			.update(instanceSystemSettingsTable)
			.set({ approvedRecordsArePublic: false })
			.where(eq(instanceSystemSettingsTable.countryAccountsId, tenantA));

		let thrownAfterDisable: unknown;
		try {
			await spatialFootprintLoader(
				makeLoaderArgs(
					`http://localhost:3000/en/api/spatial-footprint-geojson?division_id=${divisionId}&record_id=${publishedA.id}`,
					{},
					anonCookie,
				),
			);
		} catch (e) {
			thrownAfterDisable = e;
		}
		expect(thrownAfterDisable).toBeInstanceOf(Response);
		expect((thrownAfterDisable as Response).status).toBe(302);

		// 6. After tenant is deactivated mid-session, authenticated user is rejected (403)
		await dr
			.update(countryAccounts)
			.set({ status: countryAccountStatuses.INACTIVE })
			.where(eq(countryAccounts.id, tenantA));

		let thrownAfterDeactivate: unknown;
		try {
			await spatialFootprintLoader(
				makeLoaderArgs(
					`http://localhost:3000/en/api/spatial-footprint-geojson?division_id=${divisionId}&record_id=${draftA.id}`,
					{},
					memberCookie,
				),
			);
		} catch (e) {
			thrownAfterDeactivate = e;
		}
		expect(thrownAfterDeactivate).toBeInstanceOf(Response);
		expect((thrownAfterDeactivate as Response).status).toBe(403);
	});

	it("admin login loader returns generic configuration status without environment details", async () => {
		const prevFrom = process.env.EMAIL_FROM;
		process.env.EMAIL_FROM = "";
		try {
			const res = (await adminLoginLoader(
				makeLoaderArgs("http://localhost:3000/en/admin/login", {}),
			)) as Response;
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.hasConfigErrors).toBe(true);
			expect(body.configErrors).toBeUndefined();
			expect(JSON.stringify(body)).not.toContain("SESSION_SECRET");
			expect(JSON.stringify(body)).not.toContain("EMAIL_FROM");
		} finally {
			if (prevFrom === undefined) {
				delete process.env.EMAIL_FROM;
			} else {
				process.env.EMAIL_FROM = prevFrom;
			}
		}
	});
});
