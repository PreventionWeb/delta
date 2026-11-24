import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchLocation } from "./locationSearch";

function jsonResponse(body: unknown) {
	return { ok: true, json: async () => body } as Response;
}

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("searchLocation", () => {
	it("fetches Nominatim's search endpoint with the exact expected URL", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(jsonResponse([]));

		await searchLocation("Paris");

		expect(fetchMock).toHaveBeenCalledWith(
			"https://nominatim.openstreetmap.org/search?q=Paris&format=json",
		);
	});

	it("returns the first result when results are non-empty", async () => {
		const fetchMock = vi.mocked(fetch);
		const result = {
			lat: "10",
			lon: "20",
			boundingbox: ["9", "11", "19", "21"],
		};
		fetchMock.mockResolvedValue(jsonResponse([result]));

		await expect(searchLocation("Paris")).resolves.toEqual(result);
	});

	it("returns null when the response has zero results", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(jsonResponse([]));

		await expect(searchLocation("Nowhereville")).resolves.toBeNull();
	});

	it("degrades to null, not a throw, when the response is not ok (design.md Decision 11 Risks)", async () => {
		const fetchMock = vi.mocked(fetch);
		// A non-empty body proves the !response.ok guard itself short-circuits -- an empty
		// body would resolve to null either way and not actually exercise the guard.
		fetchMock.mockResolvedValue({
			ok: false,
			json: async () => [{ lat: "1", lon: "2" }],
		} as Response);

		await expect(searchLocation("Paris")).resolves.toBeNull();
	});

	it("degrades to null, not a throw, when fetch itself rejects (network failure)", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockRejectedValue(new Error("network down"));

		await expect(searchLocation("Paris")).resolves.toBeNull();
	});
});
