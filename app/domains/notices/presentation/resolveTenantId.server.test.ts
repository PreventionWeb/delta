import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("~/utils/requestContext.server", () => ({
	getRequestContext: vi.fn(),
}));
vi.mock("~/utils/session", () => ({
	getCountryAccountsIdFromSession: vi.fn(),
}));

import { getRequestContext } from "~/utils/requestContext.server";
import { getCountryAccountsIdFromSession } from "~/utils/session";
import { resolveTenantId } from "./resolveTenantId.server";

const mockGetRequestContext = vi.mocked(getRequestContext);
const mockGetCountryAccountsIdFromSession = vi.mocked(
	getCountryAccountsIdFromSession,
);

async function expectRedirectLocation(lang: string): Promise<string | null> {
	let thrown: unknown;
	try {
		await resolveTenantId(new Request("http://localhost/notices"), lang);
	} catch (err) {
		thrown = err;
	}
	expect(thrown).toBeInstanceOf(Response);
	return (thrown as Response).headers.get("Location");
}

describe("resolveTenantId", () => {
	beforeEach(() => {
		mockGetRequestContext.mockReturnValue(undefined);
		mockGetCountryAccountsIdFromSession.mockResolvedValue(null);
	});

	it("redirects to /{lang}/user/select-instance for a valid lang", async () => {
		expect(await expectRedirectLocation("en")).toBe("/en/user/select-instance");
	});

	// Open-redirect regression: an unvalidated lang param starting with "/" turns the redirect
	// target into a scheme-relative URL ("//evil.com/..."), which browsers follow cross-origin.
	it("falls back to the default language instead of building a scheme-relative redirect from an invalid lang", async () => {
		expect(await expectRedirectLocation("/evil.com")).toBe(
			"/en/user/select-instance",
		);
	});
});
