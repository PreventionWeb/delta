import { describe, it, expect } from "vitest";
import { serializeSpatialObservation } from "./serializeSpatialObservation";

describe("serializeSpatialObservation", () => {
	it("returns the untouched '' / '0' pair when there is no content", () => {
		expect(serializeSpatialObservation([], [], false)).toEqual({
			spatialObservation: "",
			spatialObservationChanged: "0",
		});
	});

	it("returns '0' even with prefilled content when not yet interacted with", () => {
		const geometry = { type: "Point", coordinates: [1, 2] };
		expect(serializeSpatialObservation([geometry], [], false)).toEqual({
			spatialObservation: JSON.stringify({
				geometries: [geometry],
				divisionIds: [],
			}),
			spatialObservationChanged: "0",
		});
	});

	it("returns '1' and the serialized JSON once interacted with and holding content", () => {
		const geometry = { type: "Point", coordinates: [1, 2] };
		expect(serializeSpatialObservation([geometry], ["div-1"], true)).toEqual({
			spatialObservation: JSON.stringify({
				geometries: [geometry],
				divisionIds: ["div-1"],
			}),
			spatialObservationChanged: "1",
		});
	});

	it("reverts to '' / '0' once interacted with but back to zero content", () => {
		expect(serializeSpatialObservation([], [], true)).toEqual({
			spatialObservation: "",
			spatialObservationChanged: "0",
		});
	});
});
