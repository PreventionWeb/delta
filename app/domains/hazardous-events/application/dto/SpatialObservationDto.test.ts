import { describe, expect, it } from "vitest";
import type { SpatialObservationRecord } from "../ports/IHazardousEventRepository";
import { toSpatialObservationDto } from "./SpatialObservationDto";

function makeRecord(
	overrides: Partial<SpatialObservationRecord> = {},
): SpatialObservationRecord {
	return {
		id: "observation-1",
		hazardousEventId: "he-1",
		observationTime: new Date("2026-01-02T00:00:00.000Z"),
		note: null,
		geometries: [{ type: "Point" }],
		divisionIds: ["div-1", "div-2"],
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-03T00:00:00.000Z"),
		...overrides,
	};
}

describe("toSpatialObservationDto", () => {
	it("maps every field and serializes observationTime/createdAt/updatedAt as ISO 8601 strings", () => {
		const record = makeRecord();

		const dto = toSpatialObservationDto(record);

		expect(dto).toEqual({
			id: "observation-1",
			hazardousEventId: "he-1",
			observationTime: "2026-01-02T00:00:00.000Z",
			note: null,
			geometries: [{ type: "Point" }],
			divisionIds: ["div-1", "div-2"],
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-03T00:00:00.000Z",
		});
	});

	it("passes through a non-null note unchanged", () => {
		const record = makeRecord({ note: "a note" });

		const dto = toSpatialObservationDto(record);

		expect(dto.note).toBe("a note");
	});

	it("passes through null note unchanged", () => {
		const record = makeRecord({ note: null });

		const dto = toSpatialObservationDto(record);

		expect(dto.note).toBeNull();
	});
});
