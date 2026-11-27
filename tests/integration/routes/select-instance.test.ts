import "../db/setup";
import { describe, it, expect, beforeAll } from "vitest";
import { RouterContextProvider } from "react-router";
import { dr } from "~/db.server";
import { initCookieStorage } from "~/utils/session";
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
});
