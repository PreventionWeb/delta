import "../db/setup";
import { describe, it, expect, beforeAll } from "vitest";
import { RouterContextProvider } from "react-router";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import {
	getUserFromSession,
	initCookieStorage,
	sessionCookie,
} from "~/utils/session";
import { createTranslationGetter } from "~/backend.server/translations";
import { SelectInstanceService } from "~/services/selectInstanceService";
import {
	buildSessionCookie,
	insertTenant,
	insertUser,
} from "../domains/notices/testHelpers";
import { countriesTable } from "../db/testSchema/countriesTable";
import {
	countryAccounts,
	countryAccountStatuses,
} from "../db/testSchema/countryAccounts";
import { userCountryAccounts } from "../db/testSchema/userCountryAccounts";
import { userTable } from "~/drizzle/schema/userTable";
import { sessionTable } from "../db/testSchema/sessionTable";
import { passwordHash } from "~/utils/passwordUtil";
import { redeemSsoInviteAtomic } from "~/backend.server/models/user/invite";
import { action as userLoginAction } from "~/routes/$lang+/user+/login";
import { action as adminLoginAction } from "~/routes/$lang+/admin+/login";
import { action as forgotPasswordAction } from "~/routes/$lang+/user+/forgot-password";
import { loader as setupAdminSsoLoader } from "~/routes/$lang+/setup+/admin-account-sso";

function makeActionArgs(countryAccountsId: string, cookie?: string) {
	const formData = new FormData();
	formData.append("countryAccountsId", countryAccountsId);
	const headers: HeadersInit = cookie ? { Cookie: cookie } : {};
	const request = new Request("http://localhost:3000/en/user/select-instance", {
		method: "POST",
		headers,
		body: formData,
	});
	return {
		request,
		params: { lang: "en" },
		context: new RouterContextProvider(),
		unstable_pattern: "/:lang/user/select-instance",
	} as any;
}

describe("SelectInstanceService.action", () => {
	beforeAll(() => {
		initCookieStorage();
		globalThis.createTranslationGetter = createTranslationGetter;
	});

	it("rejects unauthenticated requests by redirecting to login", async () => {
		const tenantId = await insertTenant();

		let thrown: unknown;
		try {
			await SelectInstanceService.action(makeActionArgs(tenantId));
		} catch (e) {
			thrown = e;
		}
		expect(thrown).toBeInstanceOf(Response);
		expect((thrown as Response).status).toBe(302);
		expect((thrown as Response).headers.get("Location")).toContain(
			"/en/user/login",
		);
	});

	it("rejects switching to a tenant the authenticated user does not belong to (403)", async () => {
		const tenantA = await insertTenant();
		const tenantB = await insertTenant();
		const userId = await insertUser();
		const cookie = await buildSessionCookie({ userId, tenantId: tenantA });

		let thrown: unknown;
		try {
			await SelectInstanceService.action(makeActionArgs(tenantB, cookie));
		} catch (e) {
			thrown = e;
		}
		expect(thrown).toBeInstanceOf(Response);
		expect((thrown as Response).status).toBe(403);
	});

	it("rejects switching to an INACTIVE country account even for a member (403)", async () => {
		const [country] = await dr
			.insert(countriesTable)
			.values({ name: `Inactive ${crypto.randomUUID().slice(0, 8)}` })
			.returning({ id: countriesTable.id });
		const [inactiveAccount] = await dr
			.insert(countryAccounts)
			.values({
				shortDescription: "INA",
				countryId: country.id,
				status: countryAccountStatuses.INACTIVE,
			})
			.returning({ id: countryAccounts.id });

		const userId = await insertUser();
		await dr.insert(userCountryAccounts).values({
			userId,
			countryAccountsId: inactiveAccount.id,
			role: "admin",
		});

		const cookie = await buildSessionCookie({
			userId,
			skipMembership: true,
		});

		let thrown: unknown;
		try {
			await SelectInstanceService.action(
				makeActionArgs(inactiveAccount.id, cookie),
			);
		} catch (e) {
			thrown = e;
		}
		expect(thrown).toBeInstanceOf(Response);
		expect((thrown as Response).status).toBe(403);
	});

	it("allows switching to an active tenant the user belongs to", async () => {
		const tenantA = await insertTenant();
		const tenantB = await insertTenant();
		const userId = await insertUser();
		const cookie = await buildSessionCookie({ userId, tenantId: tenantA });
		await dr.insert(userCountryAccounts).values({
			userId,
			countryAccountsId: tenantB,
			role: "data-viewer",
		});

		const res = await SelectInstanceService.action(
			makeActionArgs(tenantB, cookie),
		);
		expect(res).toBeInstanceOf(Response);
		expect((res as Response).status).toBe(302);
		expect((res as Response).headers.get("Set-Cookie")).toContain("__session=");
	});

	it("rejects login when user's sole country account is INACTIVE and creates no session", async () => {
		const [country] = await dr
			.insert(countriesTable)
			.values({ name: `SoloInactive ${crypto.randomUUID().slice(0, 8)}` })
			.returning({ id: countriesTable.id });
		const [inactiveAccount] = await dr
			.insert(countryAccounts)
			.values({
				shortDescription: "SOLO",
				countryId: country.id,
				status: countryAccountStatuses.INACTIVE,
			})
			.returning({ id: countryAccounts.id });

		const email = `inactive-solo-${crypto.randomUUID()}@example.com`;
		const [user] = await dr
			.insert(userTable)
			.values({
				email,
				password: passwordHash("ValidPass!123456"),
				emailVerified: true,
			})
			.returning();
		await dr.insert(userCountryAccounts).values({
			userId: user.id,
			countryAccountsId: inactiveAccount.id,
			role: "admin",
		});

		const session = await sessionCookie().getSession();
		session.set("csrfToken", "valid-csrf-token");
		const setCookie = await sessionCookie().commitSession(session);
		const cookie = setCookie.split(";")[0];

		const formData = new FormData();
		formData.append("email", email);
		formData.append("password", "ValidPass!123456");
		formData.append("csrfToken", "valid-csrf-token");

		const res = await userLoginAction({
			request: new Request("http://localhost:3000/en/user/login", {
				method: "POST",
				headers: { Cookie: cookie },
				body: formData,
			}),
			params: { lang: "en" },
			context: new RouterContextProvider(),
			unstable_pattern: "/:lang/user/login",
		} as any);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.errors?.general?.[0]).toContain("inactive");

		const createdSessions = await dr
			.select()
			.from(sessionTable)
			.where(eq(sessionTable.userId, user.id));
		expect(createdSessions).toHaveLength(0);
	});

	it("rejects login, admin login, and forgot-password requests when CSRF tokens are absent", async () => {
		const emptyForm = new FormData();
		emptyForm.append("email", "nobody@example.com");
		emptyForm.append("password", "SomePass!123456");

		const userRes = await userLoginAction({
			request: new Request("http://localhost:3000/en/user/login", {
				method: "POST",
				body: emptyForm,
			}),
			params: { lang: "en" },
			context: new RouterContextProvider(),
			unstable_pattern: "/:lang/user/login",
		} as any);
		expect(userRes.status).toBe(400);

		const adminForm = new FormData();
		adminForm.append("email", "admin@example.com");
		adminForm.append("password", "SomePass!123456");
		const adminRes = await adminLoginAction({
			request: new Request("http://localhost:3000/en/admin/login", {
				method: "POST",
				body: adminForm,
			}),
			params: { lang: "en" },
			context: new RouterContextProvider(),
			unstable_pattern: "/:lang/admin/login",
		} as any);
		expect(adminRes.status).toBe(400);

		const forgotForm = new FormData();
		forgotForm.append("email", "nobody@example.com");
		const forgotRes = (await forgotPasswordAction({
			request: new Request("http://localhost:3000/en/user/forgot-password", {
				method: "POST",
				body: forgotForm,
			}),
			params: { lang: "en" },
			context: new RouterContextProvider(),
			unstable_pattern: "/:lang/user/forgot-password",
		} as any)) as Response;
		expect(forgotRes.status).toBe(400);
	});

	it("redeemSsoInviteAtomic consumes an invite code once and revokes prior sessions", async () => {
		const inviteCode = `sso-inv-${crypto.randomUUID()}`;
		const [user] = await dr
			.insert(userTable)
			.values({
				email: `sso-invite-${crypto.randomUUID()}@example.com`,
				password: "",
				emailVerified: false,
				inviteCode,
				inviteExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
			})
			.returning();

		const cookie = await buildSessionCookie({
			userId: user.id,
			skipMembership: true,
		});

		const first = await redeemSsoInviteAtomic({
			userId: user.id,
			inviteCode,
			firstName: "Jane",
			lastName: "Doe",
		});
		expect(first?.id).toBe(user.id);
		expect(first?.inviteCode).toBe("");
		expect(first?.authType).toBe("sso_azure_b2c");

		const second = await redeemSsoInviteAtomic({
			userId: user.id,
			inviteCode,
			firstName: "Jane",
			lastName: "Doe",
		});
		expect(second).toBeNull();

		const priorSession = await getUserFromSession(
			new Request("http://localhost:3000/en/", { headers: { Cookie: cookie } }),
		);
		expect(priorSession).toBeUndefined();
	});

	it("setup/admin-account-sso redirects through the state-backed SSO login route", async () => {
		const prev = process.env.AUTHENTICATION_SUPPORTED;
		process.env.AUTHENTICATION_SUPPORTED = "form,sso_azure_b2c";
		try {
			const res = await setupAdminSsoLoader({
				request: new Request(
					"http://localhost:3000/en/setup/admin-account-sso",
				),
				params: { lang: "en" },
				context: new RouterContextProvider(),
				unstable_pattern: "/:lang/setup/admin-account-sso",
			} as any);
			expect(res).toBeInstanceOf(Response);
			expect(res.status).toBe(302);
			expect(res.headers.get("Location")).toBe(
				"/en/sso/azure-b2c/login?isAdmin=true",
			);
		} finally {
			process.env.AUTHENTICATION_SUPPORTED = prev;
		}
	});
});
