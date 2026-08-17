import { describe, expect, it } from "vitest";
import {
	buildAssessmentSectorTree,
	buildTreeSelectSelectionKeys,
	filterParentOnlySectorIds,
} from "~/frontend/disaster-event/DisasterEventForm";
import { resolveAssessmentSectorNames } from "~/frontend/events/disastereventform";

describe("disaster event assessment sector helpers", () => {
	it("builds a tree with nested sectors", () => {
		const sectors = [
			{ id: "root-1", parentId: null, name: "Health" },
			{ id: "child-1", parentId: "root-1", name: "Medical care" },
			{ id: "root-2", parentId: null, name: "Shelter" },
		];

		const tree = buildAssessmentSectorTree(sectors);

		expect(tree).toEqual([
			{
				key: "root-1",
				label: "Health",
				data: { id: "root-1", name: "Health", parentId: null },
				children: [
					{
						key: "child-1",
						label: "Medical care",
						data: { id: "child-1", name: "Medical care", parentId: "root-1" },
						children: [],
					},
				],
			},
			{
				key: "root-2",
				label: "Shelter",
				data: { id: "root-2", name: "Shelter", parentId: null },
				children: [],
			},
		]);
	});

	it("keeps only the parent sector when an ancestor is already selected", () => {
		const sectors = [
			{ id: "root-1", parentId: null, name: "Health" },
			{ id: "child-1", parentId: "root-1", name: "Medical care" },
			{ id: "root-2", parentId: null, name: "Shelter" },
		];

		expect(filterParentOnlySectorIds(sectors, ["root-1", "child-1"])).toEqual([
			"root-1",
		]);
		expect(filterParentOnlySectorIds(sectors, ["child-1"])).toEqual([
			"child-1",
		]);
		expect(filterParentOnlySectorIds(sectors, ["root-2"])).toEqual(["root-2"]);
	});

	it("marks ancestors as partially checked when a child sector is selected", () => {
		const sectors = [
			{ id: "root-1", parentId: null, name: "Health" },
			{ id: "child-1", parentId: "root-1", name: "Medical care" },
			{ id: "grandchild-1", parentId: "child-1", name: "Triage" },
		];

		expect(buildTreeSelectSelectionKeys(sectors, ["grandchild-1"])).toEqual({
			"grandchild-1": { checked: true },
			"child-1": { partialChecked: true },
			"root-1": { partialChecked: true },
		});
	});

	it("resolves assessment sector ids to display names", () => {
		const names = new Map<string, string>([
			["uuid-health", "Health"],
			["uuid-shelter", "Shelter"],
		]);

		expect(
			resolveAssessmentSectorNames(
				["uuid-shelter", "uuid-health", "missing"],
				names,
			),
		).toEqual(["Shelter", "Health"]);
	});

	it("keeps assessment descriptions separate from sector labels", () => {
		const item = {
			id: "assessment-1",
			assessmentType: "Post-disaster assessment",
			assessmentDate: "2024-06-02",
			coverage: "National",
			description: "Needs mapping completed after the flood.",
			otherSectors: "Water and sanitation",
		};
		const sectorNamesById = new Map<string, string>([["sector-1", "Health"]]);
		const sectorIds = ["sector-1"];
		const sectorNames = resolveAssessmentSectorNames(
			sectorIds,
			sectorNamesById,
		);

		expect(item.description).toBe("Needs mapping completed after the flood.");
		expect(item.description).not.toContain("Sectors:\nHealth");
		expect(item.description).not.toContain(
			"Other sectors:\nWater and sanitation",
		);
		expect(sectorNames).toEqual(["Health"]);
	});
});
