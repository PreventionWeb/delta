import "../db/setup";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema/userTable";
import { sessionTable } from "../db/testSchema/sessionTable";
import { BackendContext } from "~/backend.server/context";
import {
	changePassword,
	hashResetToken,
	resetPassword,
	resetPasswordSilentIfNotFound,
} from "~/backend.server/models/user/password";
import { passwordHash, passwordHashCompare } from "~/utils/passwordUtil";
import { createTranslationGetter } from "~/backend.server/translations";
import {
	createUserSession,
	getUserFromSession,
	initCookieStorage,
} from "~/utils/session";
import { action as changePasswordAction } from "~/routes/$lang+/user+/change-password";

vi.mock("~/utils/email", () => ({
	sendEmail: vi.fn().mockResolvedValue(undefined),
}));

function makeCtx(): BackendContext {
	return new BackendContext({ params: { lang: "en" } } as any);
}

describe("resetPassword validation", () => {
	beforeAll(() => {
		initCookieStorage();
		globalThis.createTranslationGetter = createTranslationGetter;
	});

	it("stores reset tokens as SHA-256 digests", async () => {
		const email = `hash-test-${crypto.randomUUID()}@example.com`;
		await dr.insert(userTable).values({
			email,
			password: passwordHash("InitialPassword!123"),
			emailVerified: true,
		});

		const rawToken = "a".repeat(64);
		const ok = await resetPasswordSilentIfNotFound(email, rawToken);
		expect(ok).toBe(true);

		const [row] = await dr
			.select()
			.from(userTable)
			.where(eq(userTable.email, email));
		expect(row.resetPasswordToken).not.toBe(rawToken);
		expect(row.resetPasswordToken).toBe(hashResetToken(rawToken));
	});

	it("rejects empty tokens and invalidates sessions after password reset completes", async () => {
		const email = `reset-test-${crypto.randomUUID()}@example.com`;
		const [user] = await dr
			.insert(userTable)
			.values({
				email,
				password: passwordHash("InitialPassword!123"),
				emailVerified: true,
			})
			.returning();

		await dr.insert(sessionTable).values({
			userId: user.id,
			lastActiveAt: new Date(),
		});

		const rawToken = `valid-reset-token-${crypto.randomUUID()}`;
		await resetPasswordSilentIfNotFound(email, rawToken);

		const firstRes = await resetPassword(
			makeCtx(),
			email,
			rawToken,
			"NewStrongPassword!1",
			"NewStrongPassword!1",
		);
		expect(firstRes.ok).toBe(true);

		const remainingSessions = await dr
			.select()
			.from(sessionTable)
			.where(eq(sessionTable.userId, user.id));
		expect(remainingSessions).toHaveLength(0);

		const emptyTokenRes = await resetPassword(
			makeCtx(),
			email,
			"",
			"SecondPassword!99",
			"SecondPassword!99",
		);
		expect(emptyTokenRes.ok).toBe(false);

		const [after] = await dr
			.select()
			.from(userTable)
			.where(eq(userTable.id, user.id));
		expect(
			await passwordHashCompare("NewStrongPassword!1", after.password),
		).toBe(true);
		expect(after.resetPasswordToken).toBe("");
		expect(after.resetPasswordExpiresAt.getTime()).toBeLessThanOrEqual(0);
	});

	it("returns uniform error messages for unknown email and invalid token", async () => {
		const existingEmail = `enum-${crypto.randomUUID()}@example.com`;
		await dr.insert(userTable).values({
			email: existingEmail,
			password: passwordHash("InitialPassword!123"),
			emailVerified: true,
		});
		await resetPasswordSilentIfNotFound(existingEmail, "real-token-value");

		const nonExistentRes = await resetPassword(
			makeCtx(),
			"nobody-exists@example.com",
			"some-token",
			"ValidPassword!123",
			"ValidPassword!123",
		);
		const wrongTokenRes = await resetPassword(
			makeCtx(),
			existingEmail,
			"wrong-token",
			"ValidPassword!123",
			"ValidPassword!123",
		);

		expect(nonExistentRes.ok).toBe(false);
		expect(wrongTokenRes.ok).toBe(false);
		if (!nonExistentRes.ok && !wrongTokenRes.ok) {
			expect(nonExistentRes.errors.fields?.newPassword).toEqual(
				wrongTokenRes.errors.fields?.newPassword,
			);
		}
	});

	it("revokes prior sessions and clears pending reset tokens on password change while isolating other users", async () => {
		const email = `change-pw-${crypto.randomUUID()}@example.com`;
		const otherEmail = `other-user-${crypto.randomUUID()}@example.com`;
		const [user] = await dr
			.insert(userTable)
			.values({
				email,
				password: passwordHash("CurrentPass!1234"),
				emailVerified: true,
			})
			.returning();
		const [otherUser] = await dr
			.insert(userTable)
			.values({
				email: otherEmail,
				password: passwordHash("OtherPass!123456"),
				emailVerified: true,
			})
			.returning();

		// Create two active sessions for user and one for another user
		const session1Headers = await createUserSession(user.id);
		const session2Headers = await createUserSession(user.id);
		const otherSessionHeaders = await createUserSession(otherUser.id);
		const cookie1 = session1Headers["Set-Cookie"].split(";")[0];
		const cookie2 = session2Headers["Set-Cookie"].split(";")[0];
		const otherCookie = otherSessionHeaders["Set-Cookie"].split(";")[0];

		// Issue a pending reset token before changing password
		const pendingToken = `pending-reset-${crypto.randomUUID()}`;
		await resetPasswordSilentIfNotFound(email, pendingToken);

		const formData = new FormData();
		formData.append("currentPassword", "CurrentPass!1234");
		formData.append("newPassword", "UpdatedPass!5678");
		formData.append("confirmPassword", "UpdatedPass!5678");

		const res = (await changePasswordAction({
			request: new Request("http://localhost:3000/en/user/change-password", {
				method: "POST",
				headers: { Cookie: cookie1 },
				body: formData,
			}),
			params: { lang: "en" },
			context: new RouterContextProvider(),
			unstable_pattern: "/:lang/user/change-password",
		} as any)) as unknown as Response;

		expect(res).toBeInstanceOf(Response);
		expect(res.status).toBe(302);
		const rotatedSetCookie = res.headers.get("Set-Cookie");
		expect(rotatedSetCookie).toContain("__session=");
		const rotatedCookie = rotatedSetCookie!.split(";")[0];

		// Both prior sessions for the user must now be invalid
		const checkOld1 = await getUserFromSession(
			new Request("http://localhost:3000/en/", {
				headers: { Cookie: cookie1 },
			}),
		);
		const checkOld2 = await getUserFromSession(
			new Request("http://localhost:3000/en/", {
				headers: { Cookie: cookie2 },
			}),
		);
		expect(checkOld1).toBeUndefined();
		expect(checkOld2).toBeUndefined();

		// Rotated session for the current browser must be valid
		const checkRotated = await getUserFromSession(
			new Request("http://localhost:3000/en/", {
				headers: { Cookie: rotatedCookie },
			}),
		);
		expect(checkRotated?.user.id).toBe(user.id);

		// Another user's session must remain intact
		const checkOther = await getUserFromSession(
			new Request("http://localhost:3000/en/", {
				headers: { Cookie: otherCookie },
			}),
		);
		expect(checkOther?.user.id).toBe(otherUser.id);

		// Pending reset token must no longer work
		const pendingResetRes = await resetPassword(
			makeCtx(),
			email,
			pendingToken,
			"AnotherPass!9999",
			"AnotherPass!9999",
		);
		expect(pendingResetRes.ok).toBe(false);

		// Direct changePassword call also revokes all sessions
		const directRes = await changePassword(makeCtx(), user.id, {
			currentPassword: "UpdatedPass!5678",
			newPassword: "FinalStrong!9012",
			confirmPassword: "FinalStrong!9012",
		});
		expect(directRes.ok).toBe(true);
		const afterDirect = await getUserFromSession(
			new Request("http://localhost:3000/en/", {
				headers: { Cookie: rotatedCookie },
			}),
		);
		expect(afterDirect).toBeUndefined();
	});
});
