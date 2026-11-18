// Minimal typed subset of Leaflet's global API this page calls -- no @types/leaflet package is
// installed, so this is typed locally (not `as any`, per project convention).

export interface LeafletLatLngBounds {
	isValid(): boolean;
	extend(other: LeafletLatLngBounds): void;
}

export interface LeafletLayer {
	addTo(map: LeafletMap): LeafletLayer;
	getBounds?(): LeafletLatLngBounds;
}

export interface LeafletMap {
	remove(): void;
	fitBounds(
		bounds: LeafletLatLngBounds,
		options?: { padding?: [number, number] },
	): void;
	setView(center: [number, number], zoom: number): void;
	invalidateSize(): void;
}

export interface LeafletNamespace {
	map(container: HTMLElement, options?: { preferCanvas?: boolean }): LeafletMap;
	tileLayer(
		urlTemplate: string,
		options?: { attribution?: string },
	): {
		addTo(map: LeafletMap): void;
	};
	geoJSON(data: unknown): LeafletLayer;
	latLngBounds(points: readonly unknown[]): LeafletLatLngBounds;
}

declare global {
	interface Window {
		L?: LeafletNamespace;
	}
}

const LEAFLET_JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

let leafletPromise: Promise<LeafletNamespace | null> | null = null;

/** Lazy-loads Leaflet from unpkg, mirroring legacy's own loader (no local npm dependency) so
 * both routes behave identically, without importing legacy's own untyped module (design.md Decision 5). */
export function ensureLeafletLoaded(): Promise<LeafletNamespace | null> {
	if (typeof window === "undefined") {
		return Promise.resolve(null);
	}

	if (window.L) {
		return Promise.resolve(window.L);
	}

	if (leafletPromise) {
		return leafletPromise;
	}

	leafletPromise = new Promise((resolve) => {
		if (!document.querySelector(`link[href="${LEAFLET_CSS_URL}"]`)) {
			const cssLink = document.createElement("link");
			cssLink.rel = "stylesheet";
			cssLink.href = LEAFLET_CSS_URL;
			document.head.appendChild(cssLink);
		}

		const script = document.createElement("script");
		script.src = LEAFLET_JS_URL;
		script.async = true;
		// Reset on either failure path so a later render can retry instead of being stuck forever.
		script.onload = () => {
			if (!window.L) {
				leafletPromise = null;
			}
			resolve(window.L ?? null);
		};
		script.onerror = () => {
			leafletPromise = null;
			resolve(null);
		};
		document.head.appendChild(script);
	});

	return leafletPromise;
}
