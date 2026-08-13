import { describe, expect, it } from "vitest";
import {
	buildAssessmentSectorTree,
	buildTreeSelectSelectionKeys,
	filterParentOnlySectorIds,
} from "~/frontend/disaster-event/DisasterEventForm";

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
});
