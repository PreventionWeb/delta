// Minimal typed subset of Leaflet's global API this page calls -- no @types/leaflet package is
// installed, so this is typed locally (not `as any`, per project convention).

export interface LeafletLatLngBounds {
	isValid(): boolean;
	extend(other: LeafletLatLngBounds): void;
}

export interface LeafletLayer {
	addTo(map: LeafletMap): LeafletLayer;
	getBounds?(): LeafletLatLngBounds;
	/** `L.geoJSON()`'s group only -- its child is the layer leaflet-draw's edit tool acts on. */
	getLayers?(): LeafletLayer[];
}

export interface LeafletMap {
	remove(): void;
	fitBounds(
		bounds: LeafletLatLngBounds,
		options?: { padding?: [number, number] },
	): void;
	setView(center: [number, number], zoom: number): void;
	invalidateSize(): void;
	/** Draw-picker only -- the read-only sibling map never calls it. */
	on(event: string, handler: (event: unknown) => void): void;
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

export interface LeafletDrawLayer extends LeafletLayer {
	toGeoJSON(): { type: "Feature"; geometry: unknown; properties: unknown };
	getLatLng?(): { lat: number; lng: number };
	getRadius?(): number;
}

export interface LeafletDrawCreatedEvent {
	layerType: "marker" | "polygon" | "polyline" | "rectangle" | "circle";
	layer: LeafletDrawLayer;
}

export interface LeafletFeatureGroup extends LeafletLayer {
	/** Accepts any LeafletLayer, not just LeafletDrawLayer -- a prefilled geometry's
	 * L.geoJSON() layer and a draw-created layer both get added to the same group. */
	addLayer(layer: LeafletLayer): void;
	removeLayer(layer: LeafletLayer): void;
	clearLayers(): void;
}

/** A standalone draw tool (L.Draw.Polygon etc.) -- the Mapper's mode dropdown drives these directly. */
export interface LeafletDrawHandler {
	enable(): void;
	disable(): void;
	/** Polygon/Polyline only: drops the last point of an in-progress shape. */
	deleteLastVertex?(): void;
}

/** L.EditToolbar.Edit -- `save()` fires EDITED with the moved layers synchronously, before it
 * returns; the Mapper relies on that to hold Save/mode changes after a rejected edit. */
export interface LeafletEditHandler {
	enable(): void;
	disable(): void;
	save(): void;
}

type LeafletDrawHandlerClass = new (
	map: LeafletMap,
	options?: Record<string, unknown>,
) => LeafletDrawHandler;

/** `leaflet-draw` augments `window.L` itself, not a separate global -- kept apart from
 * `LeafletNamespace` so widening it doesn't break the existing `fakeL` test literal. */
export interface LeafletDrawNamespace extends LeafletNamespace {
	FeatureGroup: new () => LeafletFeatureGroup;
	EditToolbar: {
		Edit: new (
			map: LeafletMap,
			options: { featureGroup: LeafletFeatureGroup },
		) => LeafletEditHandler;
	};
	Draw: {
		Polygon: LeafletDrawHandlerClass;
		Polyline: LeafletDrawHandlerClass;
		Rectangle: LeafletDrawHandlerClass;
		Circle: LeafletDrawHandlerClass;
		Marker: LeafletDrawHandlerClass;
		Event: {
			CREATED: string;
			EDITED: string;
			/** Fired on the map when a draw tool becomes active/inactive -- drives the host
			 * dialog's Escape gating and the mode dropdown's return to "Move map". */
			DRAWSTART: string;
			DRAWSTOP: string;
		};
	};
}

declare global {
	interface Window {
		L?: LeafletNamespace;
	}
}

const LEAFLET_JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_DRAW_JS_URL =
	"https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js";
const LEAFLET_DRAW_CSS_URL =
	"https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css";

let leafletPromise: Promise<LeafletNamespace | null> | null = null;
let leafletDrawPromise: Promise<LeafletDrawNamespace | null> | null = null;

/** Lazy-loads Leaflet from unpkg, mirroring legacy's own loader (no local npm dependency) so
 * both routes behave identically, without importing legacy's own untyped module. */
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

function hasDraw(L: LeafletNamespace): L is LeafletDrawNamespace {
	return "Draw" in L;
}

/** Loads `leaflet-draw` from the same cdnjs URL legacy uses, chained off `ensureLeafletLoaded()`
 * so it never injects before/concurrently with base Leaflet, which it requires to exist first. */
export function ensureLeafletDrawLoaded(): Promise<LeafletDrawNamespace | null> {
	if (typeof window === "undefined") {
		return Promise.resolve(null);
	}

	if (window.L && hasDraw(window.L)) {
		return Promise.resolve(window.L);
	}

	if (leafletDrawPromise) {
		return leafletDrawPromise;
	}

	leafletDrawPromise = ensureLeafletLoaded().then((L) => {
		if (!L) {
			leafletDrawPromise = null;
			return null;
		}
		if (hasDraw(L)) {
			return L;
		}

		return new Promise<LeafletDrawNamespace | null>((resolve) => {
			if (!document.querySelector(`link[href="${LEAFLET_DRAW_CSS_URL}"]`)) {
				const cssLink = document.createElement("link");
				cssLink.rel = "stylesheet";
				cssLink.href = LEAFLET_DRAW_CSS_URL;
				document.head.appendChild(cssLink);
			}

			const script = document.createElement("script");
			script.src = LEAFLET_DRAW_JS_URL;
			script.async = true;
			script.onload = () => {
				const loadedL = window.L;
				if (!loadedL || !hasDraw(loadedL)) {
					leafletDrawPromise = null;
					resolve(null);
					return;
				}
				resolve(loadedL);
			};
			script.onerror = () => {
				leafletDrawPromise = null;
				resolve(null);
			};
			document.head.appendChild(script);
		});
	});

	return leafletDrawPromise;
}
