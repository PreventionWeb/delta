import { describe, expect, it } from "vitest";
import { filterHazardTaxonomy } from "./filterHazardTaxonomy";
import type { HazardTaxonomyOptions } from "~/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase";

const options: HazardTaxonomyOptions = {
	types: [
		{ id: "type-flood", name: "Flood" },
		{ id: "type-storm", name: "Storm" },
	],
	clusters: [
		{ id: "cluster-river", typeId: "type-flood", name: "River flood" },
		{ id: "cluster-coastal", typeId: "type-flood", name: "Coastal flood" },
		{ id: "cluster-wind", typeId: "type-storm", name: "Wind storm" },
	],
	specificHazards: [
		{
			id: "hazard-flash",
			clusterId: "cluster-river",
			name: "Flash flood",
			code: "FL01",
		},
		{
			id: "hazard-riverine",
			clusterId: "cluster-river",
			name: "Riverine flood",
			code: "FL02",
		},
		{
			id: "hazard-surge",
			clusterId: "cluster-coastal",
			name: "Storm surge",
			code: "FL03",
		},
		{
			id: "hazard-tornado",
			clusterId: "cluster-wind",
			name: "Tornado",
			code: "ST01",
		},
	],
};

describe("filterHazardTaxonomy", () => {
	it("returns everything, sorted by name, when no filter or selection is active", () => {
		const result = filterHazardTaxonomy(options, "", "", "");
		expect(result.types.map((t) => t.name)).toEqual(["Flood", "Storm"]);
		expect(result.clusters.map((c) => c.name)).toEqual([
			"Coastal flood",
			"River flood",
			"Wind storm",
		]);
		expect(result.hazards.map((h) => h.name)).toEqual([
			"Flash flood",
			"Riverine flood",
			"Storm surge",
			"Tornado",
		]);
	});

	it("filters hazards by a case-insensitive substring match on name, with no type/cluster chosen (legacy's own hazardpicker.tsx:95-120)", () => {
		const result = filterHazardTaxonomy(options, "flood", "", "");
		expect(result.hazards.map((h) => h.name)).toEqual([
			"Flash flood",
			"Riverine flood",
		]);
	});

	it("derives surviving clusters/types from the filtered hazards, not a separate name match", () => {
		// "surge" matches only the Storm surge hazard (coastal cluster, flood type) -- the
		// wind-storm cluster/type must not appear even though "storm" is in its own name.
		const result = filterHazardTaxonomy(options, "surge", "", "");
		expect(result.hazards.map((h) => h.name)).toEqual(["Storm surge"]);
		expect(result.clusters.map((c) => c.name)).toEqual(["Coastal flood"]);
		expect(result.types.map((t) => t.name)).toEqual(["Flood"]);
	});

	it("is case-insensitive", () => {
		const result = filterHazardTaxonomy(options, "FLASH", "", "");
		expect(result.hazards.map((h) => h.name)).toEqual(["Flash flood"]);
	});

	it("AND-composes a selected typeId with the filter, not just the filter alone", () => {
		const result = filterHazardTaxonomy(options, "flood", "type-storm", "");
		expect(result.hazards).toEqual([]);
	});

	it("AND-composes a selected clusterId with the filter and typeId", () => {
		const result = filterHazardTaxonomy(
			options,
			"",
			"type-flood",
			"cluster-river",
		);
		expect(result.hazards.map((h) => h.name)).toEqual([
			"Flash flood",
			"Riverine flood",
		]);
	});

	it("narrows clusters to the selected typeId even with no filter text", () => {
		const result = filterHazardTaxonomy(options, "", "type-flood", "");
		expect(result.clusters.map((c) => c.name)).toEqual([
			"Coastal flood",
			"River flood",
		]);
		expect(result.hazards.map((h) => h.name)).toEqual([
			"Flash flood",
			"Riverine flood",
			"Storm surge",
		]);
	});

	it("does not disable/empty the cluster list based on hazard filtering alone -- the cluster select is never disabled in legacy", () => {
		// A filter term that matches zero hazards still returns an empty (not undefined/error)
		// result shape -- the component is responsible for "never disabled", this just proves
		// the pure function degrades to an empty array, not a throw.
		const result = filterHazardTaxonomy(options, "nonexistent", "", "");
		expect(result.types).toEqual([]);
		expect(result.clusters).toEqual([]);
		expect(result.hazards).toEqual([]);
	});
});
