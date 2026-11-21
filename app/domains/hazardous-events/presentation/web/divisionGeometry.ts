/** `division.geojson` is stored as-is from the uploaded file -- Geometry, Feature, or
 * FeatureCollection. `checkShapeAgainstDivisions` needs a bare Geometry, so unwrap first. */
export function toDivisionGeometry(
	geojson: unknown,
): { type: string; coordinates: unknown } | null {
	if (typeof geojson !== "object" || geojson === null || !("type" in geojson)) {
		return null;
	}
	const value = geojson as { type: unknown };

	if (value.type === "Feature") {
		const feature = geojson as { geometry?: unknown };
		return isGeometry(feature.geometry) ? feature.geometry : null;
	}

	if (value.type === "FeatureCollection") {
		const collection = geojson as { features?: readonly unknown[] };
		const firstFeature = collection.features?.[0] as
			| { geometry?: unknown }
			| undefined;
		return firstFeature && isGeometry(firstFeature.geometry)
			? firstFeature.geometry
			: null;
	}

	return isGeometry(geojson) ? geojson : null;
}

function isGeometry(
	value: unknown,
): value is { type: string; coordinates: unknown } {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		"coordinates" in value
	);
}
