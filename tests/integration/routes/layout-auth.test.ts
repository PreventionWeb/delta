import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LoaderFunctionArgs } from "react-router";
import { RouterContextProvider } from "react-router";

import { loader as authenticatedLoader } from "~/routes/$lang+/_authenticated";
import { loader as publicLoader } from "~/routes/$lang+/_public";
import type { UserSession } from "~/utils/session";

vi.mock("~/utils/auth", () => ({
	requireUser: vi.fn(),
	optionalUser: vi.fn(),
}));

import * as authModule from "~/utils/auth";

const BASE_URL = "http://localhost:3000/en/hazardous-event";

function makeRequest(url = BASE_URL): Request {
	return new Request(url);
}

function makeRouteArgs(url = BASE_URL): LoaderFunctionArgs {
	return {
		request: makeRequest(url),
		url: new URL(url),
		pattern: "/:lang/hazardous-event",
		params: { lang: "en" },
		context: new RouterContextProvider(),
	};
}

const mockUserSession: UserSession = {
	user: {
		id: "user-001",
		email: "test@example.com",
		firstName: "Test",
		lastName: "User",
		password: "$2b$10$secretbcryptpasswordhash",
		emailVerified: true,
		totpEnabled: false,
		totpSecret: "SUPER_SECRET_TOTP",
		totpSecretUrl: "otpauth://totp/delta?secret=SUPER_SECRET_TOTP",
		resetPasswordToken: "secret-reset-token",
		inviteCode: "secret-invite-code",
		createdAt: new Date(),
		updatedAt: new Date(),
	} as any,
	sessionId: "session-001",
	session: {
		id: "session-001",
		userId: "user-001",
		totpAuthed: true,
		createdAt: new Date(),
		lastActivityAt: new Date(),
	} as any,
};

describe("_authenticated layout loader", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("propagates redirect when requireUser throws (unauthenticated)", async () => {
		const redirect = new Response(null, {
			status: 302,
			headers: {
				Location: "/en/user/login?redirectTo=%2Fen%2Fhazardous-event",
			},
		});
		vi.mocked(authModule.requireUser).mockRejectedValue(redirect);

		await expect(authenticatedLoader(makeRouteArgs())).rejects.toBeInstanceOf(
			Response,
		);
	});

	it("returns sanitized { userSession } without credentials or raw sessionId", async () => {
		vi.mocked(authModule.requireUser).mockResolvedValue(mockUserSession);

		const response = await authenticatedLoader(makeRouteArgs());
		const data = await (response as Response).json();

		expect(data.userSession.user.id).toBe("user-001");
		expect(data.userSession.user.password).toBeUndefined();
		expect(data.userSession.user.totpSecret).toBeUndefined();
		expect(data.userSession.user.totpSecretUrl).toBeUndefined();
		expect(data.userSession.user.resetPasswordToken).toBeUndefined();
		expect(data.userSession.user.inviteCode).toBeUndefined();
		expect(data.userSession.sessionId).toBeUndefined();
		expect(data.userSession.session).toBeUndefined();
	});
});

describe("_public layout loader", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns { userSession: null } for an anonymous request (no session)", async () => {
		vi.mocked(authModule.optionalUser).mockResolvedValue(null);

		const response = await publicLoader(makeRouteArgs());
		const data = await (response as Response).json();

		expect(data.userSession).toBeNull();
	});

	it("returns sanitized { userSession } without credentials or raw sessionId", async () => {
		vi.mocked(authModule.optionalUser).mockResolvedValue(mockUserSession);

		const response = await publicLoader(makeRouteArgs());
		const data = await (response as Response).json();

		expect(data.userSession.user.id).toBe("user-001");
		expect(data.userSession.user.password).toBeUndefined();
		expect(data.userSession.user.totpSecret).toBeUndefined();
		expect(data.userSession.sessionId).toBeUndefined();
	});
});
