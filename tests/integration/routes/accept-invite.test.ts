import "../db/setup";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { RouterContextProvider } from "react-router";
import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema/userTable";
import { initCookieStorage, sessionCookie } from "~/utils/session";
import { passwordHash, passwordHashCompare } from "~/utils/passwordUtil";
import { createTranslationGetter } from "~/backend.server/translations";

vi.mock("~/utils/emailUtil", () => ({
	sendWelcomeRegistrationEmail: vi.fn().mockResolvedValue(undefined),
}));

import {
	action as acceptInviteAction,
	loader as acceptInviteLoader,
} from "~/routes/$lang+/user+/accept-invite";

async function makeCsrfCookie(csrfToken: string): Promise<string> {
	const session = await sessionCookie().getSession();
	session.set("csrfToken", csrfToken);
	const setCookie = await sessionCookie().commitSession(session);
	return setCookie.split(";")[0];
}

function makeActionArgs(
	url: string,
	fields: Record<string, string>,
	cookie: string,
) {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) {
		formData.append(k, v);
	}
	const request = new Request(url, {
		method: "POST",
		headers: { Cookie: cookie },
		body: formData,
	});
	return {
		request,
		params: { lang: "en" },
		context: new RouterContextProvider(),
		unstable_pattern: "/:lang/user/accept-invite",
	} as any;
}

describe("accept-invite action validation", () => {
	beforeAll(() => {
		initCookieStorage();
		globalThis.createTranslationGetter = createTranslationGetter;
	});

	it("rejects submission when inviteCode is missing", async () => {
		const originalPassword = "OriginalPassword!123";
		const email = `user-${crypto.randomUUID()}@example.com`;
		const [existingUser] = await dr
			.insert(userTable)
			.values({
				email,
				password: passwordHash(originalPassword),
				emailVerified: true,
				inviteCode: "",
				inviteExpiresAt: new Date(0),
			})
			.returning();

		const csrfToken = "csrf-test-token-1";
		const cookie = await makeCsrfCookie(csrfToken);

		const res = await acceptInviteAction(
			makeActionArgs(
				"http://localhost:3000/en/user/accept-invite",
				{
					csrfToken,
					email,
					firstName: "First",
					lastName: "Last",
					password: "UpdatedPassword!999",
					passwordRepeat: "UpdatedPassword!999",
				},
				cookie,
			),
		);

		expect(res).toBeInstanceOf(Response);
		expect((res as Response).status).toBe(400);

		const [after] = await dr
			.select()
			.from(userTable)
			.where(eq(userTable.id, existingUser.id));
		expect(await passwordHashCompare(originalPassword, after.password)).toBe(
			true,
		);
		expect(
			await passwordHashCompare("UpdatedPassword!999", after.password),
		).toBe(false);
	});

	it("rejects invalid or expired invite codes", async () => {
		const email = `expired-${crypto.randomUUID()}@example.com`;
		await dr.insert(userTable).values({
			email,
			password: "",
			emailVerified: false,
			inviteCode: "expired-code-123",
			inviteExpiresAt: new Date(Date.now() - 60_000),
		});

		const csrfToken = "csrf-test-token-2";
		const cookie = await makeCsrfCookie(csrfToken);

		const res = await acceptInviteAction(
			makeActionArgs(
				"http://localhost:3000/en/user/accept-invite?inviteCode=expired-code-123",
				{
					csrfToken,
					inviteCode: "expired-code-123",
					email,
					firstName: "Alice",
					lastName: "Smith",
					password: "ValidPassword!123",
					passwordRepeat: "ValidPassword!123",
				},
				cookie,
			),
		);

		expect(res).toBeInstanceOf(Response);
		expect((res as Response).status).toBe(400);
	});

	it("allows one-time valid invite redemption and rejects replay", async () => {
		const email = `invited-${crypto.randomUUID()}@example.com`;
		const inviteCode = `valid-invite-${crypto.randomUUID()}`;
		const [user] = await dr
			.insert(userTable)
			.values({
				email,
				password: "",
				emailVerified: false,
				inviteCode,
				inviteExpiresAt: new Date(Date.now() + 3_600_000),
			})
			.returning();

		// Loader issues CSRF cookie
		const loaderRes = (await acceptInviteLoader({
			request: new Request(
				`http://localhost:3000/en/user/accept-invite?inviteCode=${inviteCode}`,
			),
			params: { lang: "en" },
			context: new RouterContextProvider(),
		} as any)) as Response;
		const loaderData = await loaderRes.json();
		const setCookie = loaderRes.headers.get("Set-Cookie") || "";
		const cookie = setCookie.split(";")[0];

		const firstRes = await acceptInviteAction(
			makeActionArgs(
				`http://localhost:3000/en/user/accept-invite?inviteCode=${inviteCode}`,
				{
					csrfToken: loaderData.csrfToken,
					inviteCode,
					email,
					firstName: "Alice",
					lastName: "Tester",
					password: "StrongPassword!123",
					passwordRepeat: "StrongPassword!123",
				},
				cookie,
			),
		);
		expect(firstRes).toBeInstanceOf(Response);
		expect((firstRes as Response).status).toBe(302);

		const [updated] = await dr
			.select()
			.from(userTable)
			.where(eq(userTable.id, user.id));
		expect(updated.emailVerified).toBe(true);
		expect(updated.inviteCode).toBe("");
		expect(
			await passwordHashCompare("StrongPassword!123", updated.password),
		).toBe(true);

		// Second submission with the same code must fail
		const replayRes = await acceptInviteAction(
			makeActionArgs(
				`http://localhost:3000/en/user/accept-invite?inviteCode=${inviteCode}`,
				{
					csrfToken: loaderData.csrfToken,
					inviteCode,
					email,
					firstName: "Second",
					lastName: "Attempt",
					password: "OtherPassword!456",
					passwordRepeat: "OtherPassword!456",
				},
				cookie,
			),
		);
		expect(replayRes).toBeInstanceOf(Response);
		expect((replayRes as Response).status).toBe(400);
	});
});
