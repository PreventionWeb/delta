import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ErrorResponse } from "~/shared/errors/ErrorResponse";

vi.mock("~/utils/session", () => ({ getUserRoleFromSession: vi.fn() }));

import { getUserRoleFromSession } from "~/utils/session";
import { requireViewDataPermission } from "./requireViewDataPermission.server";

const mockGetUserRoleFromSession = vi.mocked(getUserRoleFromSession);

function makeArgs() {
	return { request: new Request("http://localhost/en/he-preview") };
}

describe("requireViewDataPermission", () => {
	beforeEach(() => {
		mockGetUserRoleFromSession.mockReset();
	});

	it("resolves with the role for a role that has ViewData", async () => {
		mockGetUserRoleFromSession.mockResolvedValue("data-viewer");

		await expect(requireViewDataPermission(makeArgs())).resolves.toBe(
			"data-viewer",
		);
	});

	it("throws a 403 Response with error.code FORBIDDEN for a role without ViewData", async () => {
		mockGetUserRoleFromSession.mockResolvedValue(undefined);

		let thrown: unknown;
		try {
			await requireViewDataPermission(makeArgs());
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		const response = thrown as Response;
		expect(response.status).toBe(403);
		const body = (await response.json()) as ErrorResponse;
		expect(body.error.code).toBe("FORBIDDEN");
	});
});
