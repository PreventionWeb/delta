import { convertCircleToTurfPolygon } from "~/utils/spatialUtils";
import type {
	LeafletDrawCreatedEvent,
	LeafletDrawLayer,
} from "./leafletLoader";

export type BareGeometry = { type: string; coordinates: unknown };

/** Under 3 distinct ring points or a zero-length line -- PostGIS would 500 on it. */
export function isDegenerate(geometry: BareGeometry): boolean {
	if (geometry.type === "Polygon") {
		const ring = (geometry.coordinates as number[][][])[0] ?? [];
		const distinct = new Set(ring.slice(0, -1).map((p) => p.join(",")));
		return distinct.size < 3;
	}
	if (geometry.type === "LineString") {
		const points = geometry.coordinates as number[][];
		return new Set(points.map((p) => p.join(","))).size < 2;
	}
	return false;
}

/** toGeoJSON() yields the correct bare Geometry for every shape type except circle --
 * L.Circle.toGeoJSON() degenerates to a Point (center only), so only circle needs conversion. */
export function extractGeometry(event: LeafletDrawCreatedEvent): BareGeometry {
	const layer = event.layer;
	if (event.layerType === "circle" && layer.getLatLng && layer.getRadius) {
		return convertCircleToTurfPolygon(layer.getLatLng(), layer.getRadius())
			.geometry as BareGeometry;
	}
	return layer.toGeoJSON().geometry as BareGeometry;
}

/** For an edited layer (no `layerType`): a radius marks a circle, which still becomes a polygon. */
export function geometryFromLayer(layer: LeafletDrawLayer): BareGeometry {
	if (layer.getLatLng && layer.getRadius) {
		return convertCircleToTurfPolygon(layer.getLatLng(), layer.getRadius())
			.geometry as BareGeometry;
	}
	return layer.toGeoJSON().geometry as BareGeometry;
}
