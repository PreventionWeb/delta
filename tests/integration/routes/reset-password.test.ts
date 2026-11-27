import "../db/setup";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema/userTable";
import { sessionTable } from "../db/testSchema/sessionTable";
import { BackendContext } from "~/backend.server/context";
import {
	hashResetToken,
	resetPassword,
	resetPasswordSilentIfNotFound,
} from "~/backend.server/models/user/password";
import { passwordHash, passwordHashCompare } from "~/utils/passwordUtil";
import { createTranslationGetter } from "~/backend.server/translations";

vi.mock("~/utils/email", () => ({
	sendEmail: vi.fn().mockResolvedValue(undefined),
}));

function makeCtx(): BackendContext {
	return new BackendContext({ params: { lang: "en" } } as any);
}

describe("resetPassword validation", () => {
	beforeAll(() => {
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
});
