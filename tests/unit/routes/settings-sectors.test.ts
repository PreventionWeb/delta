import { describe, expect, it } from "vitest";
import { roleHasPermission } from "~/frontend/user/roles";
import {
	buildSectorTree,
	collectBranchIds,
	countTreeNodes,
	filterSectorTree,
	type SectorRow,
} from "~/frontend/sectorsTree";

const SAMPLE_ROWS: SectorRow[] = [
	{
		id: "s-prod",
		name: "Productive",
		description: "Goods and services.",
		level: 1,
		parentId: null,
	},
	{
		id: "s-soc",
		name: "Social",
		description: "Living conditions.",
		level: 1,
		parentId: null,
	},
	{
		id: "s-inf",
		name: "Infrastructure",
		description: "Networks and facilities.",
		level: 1,
		parentId: null,
	},
	{
		id: "s-hous",
		name: "Housing",
		description: "Dwellings and household goods.",
		level: 2,
		parentId: "s-soc",
	},
	{
		id: "s-edu",
		name: "Education",
		description: "Schools and universities.",
		level: 2,
		parentId: "s-soc",
	},
	{
		id: "s-urb",
		name: "Urban housing",
		description: "Dwellings in cities.",
		level: 3,
		parentId: "s-hous",
	},
	{
		id: "s-rur",
		name: "Rural housing",
		description: "Dwellings outside cities.",
		level: 3,
		parentId: "s-hous",
	},
	{
		id: "s-agri",
		name: "Agriculture",
		description: "Crops and livestock.",
		level: 2,
		parentId: "s-prod",
	},
];

describe("ManageSectorSettings permission", () => {
	it("grants ManageSectorSettings to admin", () => {
		expect(roleHasPermission("admin", "ManageSectorSettings")).toBe(true);
	});

	it("denies ManageSectorSettings to non-admin roles", () => {
		expect(roleHasPermission("data-viewer", "ManageSectorSettings")).toBe(
			false,
		);
		expect(roleHasPermission("data-collector", "ManageSectorSettings")).toBe(
			false,
		);
		expect(roleHasPermission("data-validator", "ManageSectorSettings")).toBe(
			false,
		);
		expect(roleHasPermission(null, "ManageSectorSettings")).toBe(false);
	});
});

describe("sectorsTree helpers", () => {
	it("builds a hierarchy sorted alphabetically by localized name at every level", () => {
		const tree = buildSectorTree(SAMPLE_ROWS, "en");
		expect(tree.map((n) => n.name)).toEqual([
			"Infrastructure",
			"Productive",
			"Social",
		]);

		const social = tree.find((n) => n.id === "s-soc");
		expect(social?.children?.map((n) => n.name)).toEqual([
			"Education",
			"Housing",
		]);

		const housing = social?.children?.find((n) => n.id === "s-hous");
		expect(housing?.children?.map((n) => n.name)).toEqual([
			"Rural housing",
			"Urban housing",
		]);
	});

	it("promotes orphaned and self-referencing rows to root without infinite recursion", () => {
		const rows: SectorRow[] = [
			...SAMPLE_ROWS,
			{
				id: "s-orphan",
				name: "Alpha orphan",
				description: null,
				level: 2,
				parentId: "non-existent",
			},
			{
				id: "s-self",
				name: "Beta self cycle",
				description: null,
				level: 1,
				parentId: "s-self",
			},
		];
		const tree = buildSectorTree(rows, "en");
		expect(tree[0].id).toBe("s-orphan");
		expect(tree[1].id).toBe("s-self");
		expect(countTreeNodes(tree)).toBe(rows.length);
	});

	it("collects only branch node IDs that have children", () => {
		const tree = buildSectorTree(SAMPLE_ROWS, "en");
		const branches = collectBranchIds(tree);
		expect(new Set(branches)).toEqual(new Set(["s-prod", "s-soc", "s-hous"]));
	});

	it("counts all nodes across all levels", () => {
		const tree = buildSectorTree(SAMPLE_ROWS, "en");
		expect(countTreeNodes(tree)).toBe(SAMPLE_ROWS.length);
	});

	it("filters case-insensitively by name only and keeps ancestor chain", () => {
		const tree = buildSectorTree(SAMPLE_ROWS, "en");
		const filtered = filterSectorTree(tree, "URBAN");
		expect(filtered).toHaveLength(1);
		expect(filtered[0].id).toBe("s-soc");
		expect(filtered[0].children).toHaveLength(1);
		expect(filtered[0].children?.[0].id).toBe("s-hous");
		expect(filtered[0].children?.[0].children?.map((c) => c.id)).toEqual([
			"s-urb",
		]);
		expect(countTreeNodes(filtered)).toBe(3);
	});

	it("retains all children of a matching parent when no child matches", () => {
		const tree = buildSectorTree(SAMPLE_ROWS, "en");
		const filtered = filterSectorTree(tree, "Social");
		expect(filtered).toHaveLength(1);
		expect(filtered[0].id).toBe("s-soc");
		expect(filtered[0].children?.map((c) => c.id)).toEqual(["s-edu", "s-hous"]);
		expect(countTreeNodes(filtered)).toBe(5);
	});

	it("does not match description-only text", () => {
		const tree = buildSectorTree(SAMPLE_ROWS, "en");
		const filtered = filterSectorTree(tree, "universities");
		expect(filtered).toEqual([]);
		expect(countTreeNodes(filtered)).toBe(0);
	});

	it("returns original tree when query is empty or whitespace", () => {
		const tree = buildSectorTree(SAMPLE_ROWS, "en");
		expect(filterSectorTree(tree, "   ")).toBe(tree);
	});
});
