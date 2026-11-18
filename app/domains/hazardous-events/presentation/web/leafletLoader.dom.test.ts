import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { LeafletNamespace } from "./leafletLoader";

const fakeL: LeafletNamespace = {
	map: vi.fn(),
	tileLayer: vi.fn(),
	geoJSON: vi.fn(),
	latLngBounds: vi.fn(),
};

function getScripts(): HTMLScriptElement[] {
	return Array.from(
		document.querySelectorAll<HTMLScriptElement>('script[src*="leaflet"]'),
	);
}

beforeEach(() => {
	// leafletPromise is module-level state; a fresh module instance per test avoids leakage between tests.
	vi.resetModules();
});

afterEach(() => {
	delete window.L;
	for (const script of getScripts()) {
		script.remove();
	}
	document.querySelectorAll('link[href*="leaflet"]').forEach((link) => {
		link.remove();
	});
});

describe("ensureLeafletLoaded", () => {
	it("injects exactly one script tag and caches the same promise across repeated calls", async () => {
		const { ensureLeafletLoaded } = await import("./leafletLoader");

		const first = ensureLeafletLoaded();
		const second = ensureLeafletLoaded();

		expect(first).toBe(second);
		expect(getScripts()).toHaveLength(1);
	});

	it("resolves with window.L once the injected script fires load", async () => {
		const { ensureLeafletLoaded } = await import("./leafletLoader");

		const promise = ensureLeafletLoaded();
		window.L = fakeL;
		getScripts()[0].dispatchEvent(new Event("load"));

		await expect(promise).resolves.toBe(fakeL);
	});

	it("resolves null and retries with a new script on the next call when the script errors", async () => {
		const { ensureLeafletLoaded } = await import("./leafletLoader");

		const first = ensureLeafletLoaded();
		getScripts()[0].dispatchEvent(new Event("error"));
		await expect(first).resolves.toBeNull();

		ensureLeafletLoaded();
		expect(getScripts()).toHaveLength(2);
	});

	it("resolves null and retries when the script loads without ever setting window.L", async () => {
		const { ensureLeafletLoaded } = await import("./leafletLoader");

		const first = ensureLeafletLoaded();
		getScripts()[0].dispatchEvent(new Event("load"));
		await expect(first).resolves.toBeNull();

		ensureLeafletLoaded();
		expect(getScripts()).toHaveLength(2);
	});

	it("returns window.L immediately, injecting no script, when Leaflet is already loaded", async () => {
		window.L = fakeL;
		const { ensureLeafletLoaded } = await import("./leafletLoader");

		await expect(ensureLeafletLoaded()).resolves.toBe(fakeL);
		expect(getScripts()).toHaveLength(0);
	});
});
