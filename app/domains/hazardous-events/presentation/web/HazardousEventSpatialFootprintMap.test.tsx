import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { HazardousEventSpatialFootprintMap } from "./HazardousEventSpatialFootprintMap";

// Node tier (renderToString, no jsdom) -- matches HazardousEventLocationMap.test.tsx's own
// precedent exactly, except for the one deliberate behavioral difference design.md Decision 7
// calls out: this picker's map must stay drawable with zero shapes, so it must NOT return null
// for an empty geometries array the way the read-only sibling does.
describe("HazardousEventSpatialFootprintMap", () => {
	it("renders a drawable container even when geometries is empty, unlike the read-only HazardousEventLocationMap", () => {
		const html = renderToString(
			<HazardousEventSpatialFootprintMap
				geometries={[]}
				onSave={() => {}}
				previewDivisions={[]}
				aria-label="Spatial footprint map"
			/>,
		);

		expect(html).not.toBe("");
		expect(html).toMatch(/aria-label="Spatial footprint map"/);
	});

	it("renders the same drawable container shape when geometries is non-empty", () => {
		const html = renderToString(
			<HazardousEventSpatialFootprintMap
				geometries={[{ type: "Point", coordinates: [0, 0] }]}
				onSave={() => {}}
				previewDivisions={[]}
				aria-label="Spatial footprint map"
			/>,
		);

		expect(html).toMatch(/aria-label="Spatial footprint map"/);
	});

	it("renders a drawable container with previewDivisions set and geometries empty", () => {
		const html = renderToString(
			<HazardousEventSpatialFootprintMap
				geometries={[]}
				onSave={() => {}}
				previewDivisions={[
					{
						id: "div-1",
						name: "Division One",
						geojson: {
							type: "Polygon",
							coordinates: [
								[
									[0, 0],
									[1, 0],
									[1, 1],
									[0, 1],
									[0, 0],
								],
							],
						},
					},
				]}
				aria-label="Spatial footprint map"
			/>,
		);

		expect(html).not.toBe("");
	});
});
