import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { HazardousEventLocationMap } from "~/domains/hazardous-events/presentation/web/HazardousEventLocationMap";

describe("HazardousEventLocationMap", () => {
	it("renders no container when geometries is empty", () => {
		const html = renderToString(
			<HazardousEventLocationMap geometries={[]} aria-label="map" />,
		);

		expect(html).toBe("");
	});

	it("renders a labelled container when geometries is non-empty", () => {
		const html = renderToString(
			<HazardousEventLocationMap
				geometries={[{ type: "Point", coordinates: [0, 0] }]}
				aria-label="Spatial footprint map"
			/>,
		);

		expect(html).toMatch(/<div[^>]*aria-label="Spatial footprint map"/);
	});
});
