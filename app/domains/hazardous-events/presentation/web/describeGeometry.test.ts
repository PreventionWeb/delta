import { describe, it, expect } from "vitest";
import { describeGeometry, describeGeometryParts } from "./describeGeometry";

describe("describeGeometry", () => {
	it("formats a Polygon's ring corners, dropping the closing point", () => {
		const text = describeGeometry({
			type: "Polygon",
			coordinates: [
				[
					[0, 0],
					[1, 0],
					[1, 1],
					[0, 0],
				],
			],
		});

		expect(text).toBe(
			"Shape: Polygon — Lat 0, Lng 0 — Lat 0, Lng 1 — Lat 1, Lng 1",
		);
	});

	it("formats a Point's single coordinate", () => {
		const text = describeGeometry({ type: "Point", coordinates: [12, 34] });

		expect(text).toBe("Shape: Point — Lat 34, Lng 12");
	});

	it("formats a LineString's two endpoints, not its intermediate points", () => {
		const text = describeGeometry({
			type: "LineString",
			coordinates: [
				[0, 0],
				[5, 5],
				[10, 10],
			],
		});

		expect(text).toBe("Shape: LineString — Lat 0, Lng 0 — Lat 10, Lng 10");
	});

	it("verbatim geometry.type, never translated or re-labelled -- a Point stays Point", () => {
		const text = describeGeometry({ type: "Point", coordinates: [1, 2] });

		expect(text).toContain("Shape: Point");
		expect(text).not.toContain("Marker");
	});

	it("summarizes a many-point ring (e.g. a polygonized circle) as a count, not one line per corner", () => {
		// A circle is polygonized into a 64-point ring before reaching this function -- any
		// polygon with that many points must degrade the same way, not just circles specifically.
		const manyPointRing = Array.from({ length: 64 }, (_, i) => [i, i]);
		const closedRing = [...manyPointRing, manyPointRing[0]];
		const text = describeGeometry({
			type: "Polygon",
			coordinates: [closedRing],
		});

		expect(text).toBe("Shape: Polygon — 64 corner points");
	});

	it("still lists every corner individually for a small polygon at the display limit", () => {
		const ring = [
			[0, 0],
			[1, 0],
			[2, 1],
			[3, 2],
			[4, 3],
			[5, 4],
			[6, 5],
			[7, 6],
			[0, 0],
		];
		const text = describeGeometry({ type: "Polygon", coordinates: [ring] });

		expect(text.startsWith("Shape: Polygon — Lat 0, Lng 0")).toBe(true);
		expect(text).not.toContain("corner points");
	});

	it("an unrecognized geometry type still renders a Shape label with no corners, not a crash", () => {
		const text = describeGeometry({
			type: "MultiPolygon",
			coordinates: [],
		});

		expect(text).toBe("Shape: MultiPolygon");
	});

	it("a Polygon with a single-point ring returns that one corner, not a crash on an empty comparison", () => {
		const text = describeGeometry({
			type: "Polygon",
			coordinates: [[[1, 2]]],
		});

		expect(text).toBe("Shape: Polygon — Lat 2, Lng 1");
	});

	it("a Polygon with no rings at all (empty coordinates) renders with no corners, not a crash", () => {
		const text = describeGeometry({ type: "Polygon", coordinates: [] });

		expect(text).toBe("Shape: Polygon");
	});

	it("a Polygon ring that is already open (first and last points differ on both axes) keeps every point", () => {
		const text = describeGeometry({
			type: "Polygon",
			coordinates: [
				[
					[0, 0],
					[1, 0],
					[2, 2],
				],
			],
		});

		expect(text).toBe(
			"Shape: Polygon — Lat 0, Lng 0 — Lat 0, Lng 1 — Lat 2, Lng 2",
		);
	});

	it("a Polygon ring matching on only the lng axis (not a real closing point) keeps every point", () => {
		const text = describeGeometry({
			type: "Polygon",
			coordinates: [
				[
					[0, 0],
					[1, 0],
					[0, 5],
				],
			],
		});

		expect(text).toBe(
			"Shape: Polygon — Lat 0, Lng 0 — Lat 0, Lng 1 — Lat 5, Lng 0",
		);
	});

	it("a Polygon ring matching on only the lat axis (not a real closing point) keeps every point", () => {
		const text = describeGeometry({
			type: "Polygon",
			coordinates: [
				[
					[0, 0],
					[1, 0],
					[5, 0],
				],
			],
		});

		expect(text).toBe(
			"Shape: Polygon — Lat 0, Lng 0 — Lat 0, Lng 1 — Lat 0, Lng 5",
		);
	});

	it("a LineString with no coordinates renders with no corners, not a crash", () => {
		const text = describeGeometry({ type: "LineString", coordinates: [] });

		expect(text).toBe("Shape: LineString");
	});
});

describe("describeGeometryParts", () => {
	const square = {
		type: "Polygon",
		coordinates: [
			[
				[0, 0],
				[1, 0],
				[1, 1],
				[0, 0],
			],
		],
	};

	it("splits the summary into its Shape title and one line per corner", () => {
		expect(describeGeometryParts(square)).toEqual({
			title: "Shape: Polygon",
			lines: ["Lat 0, Lng 0", "Lat 0, Lng 1", "Lat 1, Lng 1"],
		});
	});

	it("joins back to exactly describeGeometry's text", () => {
		const { title, lines } = describeGeometryParts(square);
		expect([title, ...lines].join(" — ")).toBe(describeGeometry(square));
	});

	it("keeps duplicate lines (a closed line's equal endpoints) rather than merging them", () => {
		const closedLine = {
			type: "LineString",
			coordinates: [
				[1, 2],
				[3, 4],
				[1, 2],
			],
		};
		expect(describeGeometryParts(closedLine).lines).toEqual([
			"Lat 2, Lng 1",
			"Lat 2, Lng 1",
		]);
	});
});
