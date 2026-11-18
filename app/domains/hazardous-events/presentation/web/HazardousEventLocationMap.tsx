import { useEffect, useRef } from "react";
import { ensureLeafletLoaded, type LeafletMap } from "./leafletLoader";

export interface HazardousEventLocationMapProps {
	/** Raw GeoJSON Geometry objects (ST_AsGeoJSON), not Features -- Leaflet auto-wraps bare Geometries, so no pre-wrapping is needed here. */
	geometries: readonly unknown[];
	"aria-label": string;
}

// Single-layer render of currentSpatialObservation.geometries (Decision 5); renders null when empty, caller owns empty-state text.
export function HazardousEventLocationMap({
	geometries,
	"aria-label": ariaLabel,
}: HazardousEventLocationMapProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<LeafletMap | null>(null);

	useEffect(() => {
		if (geometries.length === 0 || !containerRef.current) {
			return;
		}

		let cancelled = false;
		let invalidateTimer: ReturnType<typeof setTimeout> | undefined;
		ensureLeafletLoaded().then((L) => {
			if (cancelled || !L || !containerRef.current) {
				return;
			}

			const map = L.map(containerRef.current, { preferCanvas: true });
			mapRef.current = map;

			L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
				attribution: "",
			}).addTo(map);

			const bounds = L.latLngBounds([]);
			for (const geometry of geometries) {
				const layer = L.geoJSON(geometry);
				layer.addTo(map);
				try {
					const layerBounds = layer.getBounds?.();
					if (layerBounds && layerBounds.isValid()) {
						bounds.extend(layerBounds);
					}
				} catch {
					// A malformed geometry's bounds must not block the rest of the layers (legacy's own precedent).
				}
			}

			if (bounds.isValid()) {
				map.fitBounds(bounds, { padding: [24, 24] });
			} else {
				map.setView([0, 0], 2);
			}

			// Card layout settles after this effect commits; without this the map renders at a stale (often zero) size (legacy's precedent).
			invalidateTimer = setTimeout(() => map.invalidateSize(), 0);
		});

		return () => {
			cancelled = true;
			// Cleared so a stale timer never calls invalidateSize() on a map already torn down below.
			clearTimeout(invalidateTimer);
			// Without remove(), StrictMode's double-mount throws "Map container is already initialized."
			mapRef.current?.remove();
			mapRef.current = null;
		};
	}, [geometries]);

	if (geometries.length === 0) {
		return null;
	}

	return (
		<div
			ref={containerRef}
			// region, not img: Leaflet injects focusable zoom controls here; img's "presentational children" rule would hide them from a11y tools.
			role="region"
			aria-label={ariaLabel}
			className="h-80 w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100"
		/>
	);
}
