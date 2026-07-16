import { beforeEach, describe, expect, it, vi } from "vitest";

// findLocale's only external dependency (step 3 of the resolution chain).
const { getCountrySettingsFromSessionMock } = vi.hoisted(() => ({
	getCountrySettingsFromSessionMock: vi.fn(),
}));

vi.mock("~/utils/session", () => ({
	getCountrySettingsFromSession: getCountrySettingsFromSessionMock,
}));

const { pinoErrorMock } = vi.hoisted(() => ({ pinoErrorMock: vi.fn() }));

vi.mock("~/infrastructure/logging/PinoLogger.server", () => ({
	getPinoLogger: () => ({ error: pinoErrorMock }),
}));

import { findLocale } from "~/middleware/i18next.server";

describe("findLocale", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns the URL language segment when it is a valid, supported language (step 1)", async () => {
		getCountrySettingsFromSessionMock.mockResolvedValue({ language: "es" });

		const result = await findLocale(
			new Request("http://localhost/fr/some-route"),
		);

		expect(result).toBe("fr");
		expect(getCountrySettingsFromSessionMock).not.toHaveBeenCalled();
	});

	it("falls through to the tenant default locale when no URL segment is present (step 3)", async () => {
		getCountrySettingsFromSessionMock.mockResolvedValue({ language: "fr" });

		const result = await findLocale(new Request("http://localhost/some-route"));

		expect(result).toBe("fr");
	});

	it("returns null when the URL segment is unsupported and no tenant setting is cached", async () => {
		getCountrySettingsFromSessionMock.mockResolvedValue(undefined);

		const result = await findLocale(
			new Request("http://localhost/xx/some-route"),
		);

		expect(result).toBeNull();
	});

	it("returns null when there is no URL segment and no tenant setting is cached (anonymous/pre-login request)", async () => {
		getCountrySettingsFromSessionMock.mockResolvedValue(undefined);

		const result = await findLocale(new Request("http://localhost/"));

		expect(result).toBeNull();
	});

	it("returns null when the cached tenant settings row has no language field", async () => {
		getCountrySettingsFromSessionMock.mockResolvedValue({});

		const result = await findLocale(new Request("http://localhost/some-route"));

		expect(result).toBeNull();
	});

	it("never throws even when the session lookup rejects (malformed/unusual request shape)", async () => {
		const rejectionError = new Error("boom");
		getCountrySettingsFromSessionMock.mockRejectedValue(rejectionError);

		await expect(
			findLocale(new Request("http://localhost/some-route")),
		).resolves.toBeNull();
		expect(pinoErrorMock).toHaveBeenCalledWith(
			expect.objectContaining({ err: rejectionError }),
		);
	});
});
