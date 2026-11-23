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

const LEAFLET_DRAW_JS_URL =
	"https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js";
const LEAFLET_DRAW_CSS_URL =
	"https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css";

function getDrawScripts(): HTMLScriptElement[] {
	return getScripts().filter((script) => script.src.includes("leaflet.draw"));
}

function getBaseScripts(): HTMLScriptElement[] {
	return getScripts().filter((script) => !script.src.includes("leaflet.draw"));
}

function getDrawLinks(): HTMLLinkElement[] {
	return Array.from(
		document.querySelectorAll<HTMLLinkElement>('link[href*="leaflet.draw"]'),
	);
}

// Draw-script injection runs in a `.then()` off the base promise -- a macrotask tick
// flushes it reliably, regardless of hop count.
function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
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

describe("ensureLeafletDrawLoaded", () => {
	it("injects exactly one script and one link tag at the exact leaflet-draw cdnjs URLs once base Leaflet is available", async () => {
		window.L = fakeL;
		const { ensureLeafletDrawLoaded } = await import("./leafletLoader");

		ensureLeafletDrawLoaded();
		await flushMicrotasks();

		const scripts = getDrawScripts();
		const links = getDrawLinks();
		expect(scripts).toHaveLength(1);
		expect(scripts[0].src).toBe(LEAFLET_DRAW_JS_URL);
		expect(links).toHaveLength(1);
		expect(links[0].href).toBe(LEAFLET_DRAW_CSS_URL);
	});

	it("injects leaflet-draw's script only after base Leaflet's own onload fires, never concurrently or before", async () => {
		const { ensureLeafletDrawLoaded } = await import("./leafletLoader");

		ensureLeafletDrawLoaded();
		await flushMicrotasks();

		expect(getDrawScripts()).toHaveLength(0);
		expect(getBaseScripts()).toHaveLength(1);

		window.L = fakeL;
		getBaseScripts()[0].dispatchEvent(new Event("load"));
		await flushMicrotasks();

		expect(getDrawScripts()).toHaveLength(1);
	});

	it("resolves null and retries with a new script on the next call when leaflet-draw's script errors", async () => {
		window.L = fakeL;
		const { ensureLeafletDrawLoaded } = await import("./leafletLoader");

		const first = ensureLeafletDrawLoaded();
		await flushMicrotasks();
		getDrawScripts()[0].dispatchEvent(new Event("error"));
		await expect(first).resolves.toBeNull();

		ensureLeafletDrawLoaded();
		await flushMicrotasks();
		expect(getDrawScripts()).toHaveLength(2);
	});
});

describe("concurrent callers", () => {
	it("ensureLeafletLoaded shares one in-flight promise and resolves both callers to the same value (reconfirms the single-script guarantee)", async () => {
		const { ensureLeafletLoaded } = await import("./leafletLoader");

		const first = ensureLeafletLoaded();
		const second = ensureLeafletLoaded();

		expect(first).toBe(second);
		expect(getScripts()).toHaveLength(1);

		window.L = fakeL;
		getScripts()[0].dispatchEvent(new Event("load"));

		const [firstResult, secondResult] = await Promise.all([first, second]);
		expect(firstResult).toBe(fakeL);
		expect(secondResult).toBe(fakeL);
	});

	it("ensureLeafletDrawLoaded shares one in-flight promise and injects exactly one script/link pair for two simultaneous callers", async () => {
		window.L = fakeL;
		const { ensureLeafletDrawLoaded } = await import("./leafletLoader");

		const first = ensureLeafletDrawLoaded();
		const second = ensureLeafletDrawLoaded();

		expect(first).toBe(second);
		await flushMicrotasks();

		expect(getDrawScripts()).toHaveLength(1);
		expect(getDrawLinks()).toHaveLength(1);

		getDrawScripts()[0].dispatchEvent(new Event("load"));

		const [firstResult, secondResult] = await Promise.all([first, second]);
		expect(firstResult).toBe(secondResult);
	});
});
