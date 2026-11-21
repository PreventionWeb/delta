import type { BareGeometry } from "./spatialFootprintGeometry";

/** A ring's closing point duplicates its first -- not a real corner. */
function dropRingClosingPoint(ring: readonly number[][]): readonly number[][] {
	if (ring.length <= 1) {
		return ring;
	}
	const [first] = ring;
	const last = ring[ring.length - 1];
	return first[0] === last[0] && first[1] === last[1]
		? ring.slice(0, -1)
		: ring;
}

/** GeoJSON orders [lng, lat]; this returns the corners in display (lat, lng) order. */
function extractCorners(geometry: BareGeometry): readonly number[][] {
	if (geometry.type === "Polygon") {
		const ring = (geometry.coordinates as number[][][])[0] ?? [];
		return dropRingClosingPoint(ring);
	}
	if (geometry.type === "LineString") {
		const points = geometry.coordinates as number[][];
		return points.length === 0 ? [] : [points[0], points[points.length - 1]];
	}
	if (geometry.type === "Point") {
		return [geometry.coordinates as number[]];
	}
	return [];
}

function formatCorner([lng, lat]: readonly number[]): string {
	return `Lat ${lat}, Lng ${lng}`;
}

// A circle is polygonized into a 64-point ring (convertCircleToTurfPolygon) before it ever
// reaches this function -- past this count, list each corner is unusable text, so summarize.
const CORNER_DISPLAY_LIMIT = 8;

/** "Shape: <TYPE>" (verbatim, never translated) plus each corner's literal Lat/Lng text, or a
 * count summary past CORNER_DISPLAY_LIMIT. The Add dialog lays these out as a heading and list. */
export function describeGeometryParts(geometry: BareGeometry): {
	title: string;
	lines: readonly string[];
} {
	const corners = extractCorners(geometry);
	return {
		title: `Shape: ${geometry.type}`,
		lines:
			corners.length > CORNER_DISPLAY_LIMIT
				? [`${corners.length} corner points`]
				: corners.map(formatCorner),
	};
}

/** The same summary as one line -- the row table's geometry-row label. */
export function describeGeometry(geometry: BareGeometry): string {
	const { title, lines } = describeGeometryParts(geometry);
	return [title, ...lines].join(" — ");
}
