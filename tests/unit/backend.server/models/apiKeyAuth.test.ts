import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiAuth } from "~/backend.server/models/api_key";
import { ApiKeyRepository } from "~/db/queries/apiKeyRepository";

describe("apiAuth", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("throws a 401 Response when the X-Auth header is missing", async () => {
		const req = new Request("http://localhost/api/test");

		try {
			await apiAuth(req);
			expect.unreachable("apiAuth should have thrown a 401 Response");
		} catch (err) {
			expect(err).toBeInstanceOf(Response);
			const response = err as Response;
			expect(response.status).toBe(401);
		}
	});

	it("throws a 401 Response when the key secret is not found in database (getBySecret returns empty array) — DEF-002", async () => {
		vi.spyOn(ApiKeyRepository, "getBySecret").mockResolvedValue([] as any);

		const req = new Request("http://localhost/api/test", {
			headers: { "X-Auth": "non-existent-secret-key" },
		});

		try {
			await apiAuth(req);
			expect.unreachable(
				"apiAuth should have thrown a 401 Response for non-existent key",
			);
		} catch (err) {
			expect(err).toBeInstanceOf(Response);
			const response = err as Response;
			expect(response.status).toBe(401);
		}
	});

	it("returns the key record when a valid secret is found", async () => {
		const fakeKey = {
			id: "key-123",
			secret: "valid-secret-key",
			name: "Test Key",
			managedByUserId: "user-456",
			countryAccountsId: "tenant-789",
			createdAt: new Date(),
			updatedAt: null,
		};
		vi.spyOn(ApiKeyRepository, "getBySecret").mockResolvedValue([
			fakeKey,
		] as any);

		const req = new Request("http://localhost/api/test", {
			headers: { "X-Auth": "valid-secret-key" },
		});

		const result = await apiAuth(req);
		expect(result).toEqual(fakeKey);
	});
});
