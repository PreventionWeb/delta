import { describe, it, expect } from "vitest";
import { toDivisionGeometry } from "./divisionGeometry";

const GEOMETRY = { type: "Polygon", coordinates: [[[0, 0]]] };

describe("toDivisionGeometry", () => {
	it("returns a bare Geometry unchanged", () => {
		expect(toDivisionGeometry(GEOMETRY)).toEqual(GEOMETRY);
	});

	it("unwraps a Feature to its geometry", () => {
		expect(
			toDivisionGeometry({
				type: "Feature",
				geometry: GEOMETRY,
				properties: {},
			}),
		).toEqual(GEOMETRY);
	});

	it("unwraps a FeatureCollection to its first feature's geometry", () => {
		expect(
			toDivisionGeometry({
				type: "FeatureCollection",
				features: [{ type: "Feature", geometry: GEOMETRY, properties: {} }],
			}),
		).toEqual(GEOMETRY);
	});

	it("returns null for a Feature with no geometry", () => {
		expect(
			toDivisionGeometry({ type: "Feature", geometry: null, properties: {} }),
		).toBeNull();
	});

	it("returns null for an empty FeatureCollection", () => {
		expect(
			toDivisionGeometry({ type: "FeatureCollection", features: [] }),
		).toBeNull();
	});

	it("returns null for null/non-object input", () => {
		expect(toDivisionGeometry(null)).toBeNull();
		expect(toDivisionGeometry("not geojson")).toBeNull();
	});

	it("returns null for a Feature whose geometry is missing coordinates", () => {
		expect(
			toDivisionGeometry({
				type: "Feature",
				geometry: { type: "Point" },
				properties: {},
			}),
		).toBeNull();
	});
});
