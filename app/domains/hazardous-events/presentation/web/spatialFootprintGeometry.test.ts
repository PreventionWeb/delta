import { describe, it, expect } from "vitest";
import { isDegenerate, extractGeometry } from "./spatialFootprintGeometry";
import type { LeafletDrawCreatedEvent } from "./leafletLoader";

describe("isDegenerate", () => {
	it("rejects a polygon with fewer than 3 distinct points", () => {
		expect(
			isDegenerate({
				type: "Polygon",
				coordinates: [
					[
						[0, 0],
						[1, 1],
						[0, 0],
					],
				],
			}),
		).toBe(true);
	});

	it("accepts a polygon with 3 distinct points", () => {
		expect(
			isDegenerate({
				type: "Polygon",
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0],
					],
				],
			}),
		).toBe(false);
	});

	it("rejects a zero-length line (all points identical)", () => {
		expect(
			isDegenerate({
				type: "LineString",
				coordinates: [
					[0, 0],
					[0, 0],
				],
			}),
		).toBe(true);
	});

	it("never flags a Point as degenerate", () => {
		expect(isDegenerate({ type: "Point", coordinates: [0, 0] })).toBe(false);
	});

	it("treats a polygon with no rings at all as degenerate, not a throw", () => {
		expect(isDegenerate({ type: "Polygon", coordinates: [] })).toBe(true);
	});

	it("counts distinct points by their full comma-joined coordinate, not by string concatenation", () => {
		// [1,23]/[12,3] are distinct with "," but collide as "123" without it.
		expect(
			isDegenerate({
				type: "Polygon",
				coordinates: [
					[
						[1, 23],
						[12, 3],
						[9, 9],
						[1, 23],
					],
				],
			}),
		).toBe(false);
	});

	it("accepts a line with 2 or more distinct points, counted by full coordinate not concatenation", () => {
		// [1,23]/[12,3] are distinct with "," but collide as "123" without it.
		expect(
			isDegenerate({
				type: "LineString",
				coordinates: [
					[1, 23],
					[12, 3],
				],
			}),
		).toBe(false);
	});
});

describe("extractGeometry", () => {
	it("returns a non-circle layer's own toGeoJSON().geometry unchanged", () => {
		const geometry = { type: "Polygon", coordinates: [[[0, 0]]] };
		const event = {
			layerType: "polygon",
			layer: {
				toGeoJSON: () => ({ type: "Feature", geometry, properties: {} }),
			},
		} as unknown as LeafletDrawCreatedEvent;

		expect(extractGeometry(event)).toEqual(geometry);
	});

	it("converts a circle layer to a real Polygon via its center/radius, not its own degenerate Point toGeoJSON()", () => {
		const center = { lat: 10, lng: 20 };
		const event = {
			layerType: "circle",
			layer: {
				getLatLng: () => center,
				getRadius: () => 500,
				toGeoJSON: () => ({
					type: "Feature",
					geometry: { type: "Point", coordinates: [20, 10] },
					properties: {},
				}),
			},
		} as unknown as LeafletDrawCreatedEvent;

		const result = extractGeometry(event);
		expect(result.type).toBe("Polygon");
	});
});
