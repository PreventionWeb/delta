import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SectorRow } from "~/frontend/sectorsTree";
import SectorsPage from "~/pages/SectorsPage";

vi.mock("~/frontend/context", () => ({
	useViewContext: () => ({
		lang: "en",
		user: null,
		url: (p: string) => `/en${p}`,
		t: (
			input: { code: string; msg: string },
			params?: Record<string, string | number>,
		) => {
			if (!params) return input.msg;
			return input.msg.replace(/\{(\w+)\}/g, (_, key) =>
				String(params[key] ?? ""),
			);
		},
	}),
}));

const SAMPLE_SECTORS: SectorRow[] = [
	{
		id: "s-soc",
		name: "Social",
		description: "Services and assets that support people's living conditions.",
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
		id: "s-urb",
		name: "Urban housing",
		description: "Dwellings in towns and cities.",
		level: 3,
		parentId: "s-hous",
	},
	{
		id: "s-edu",
		name: "Education",
		description: "Schools, universities and training centres.",
		level: 2,
		parentId: "s-soc",
	},
	{
		id: "s-prod",
		name: "Productive",
		description: "Sectors that produce goods and services for sale.",
		level: 1,
		parentId: null,
	},
	{
		id: "s-agri",
		name: "Agriculture",
		description: "Crops, livestock, fisheries and forestry.",
		level: 2,
		parentId: "s-prod",
	},
];

beforeAll(() => {
	if (!Element.prototype.scrollTo) {
		Element.prototype.scrollTo = vi.fn();
	}
});

afterEach(() => {
	cleanup();
});

describe("SectorsPage", () => {
	it("renders header, subtitle, single read-only tree without NavSettings or tabs, with level-1 expanded by default", () => {
		render(<SectorsPage sectors={SAMPLE_SECTORS} lang="en" />);

		expect(
			screen.getByRole("heading", { level: 1, name: "Sectors" }),
		).toBeTruthy();
		expect(
			screen.getByText(
				"The sectors used to classify losses and damages. The list is the same for every country and cannot be changed here.",
			),
		).toBeTruthy();

		// No NavSettings or legacy Tree/Table tabs
		expect(screen.queryByRole("tablist")).toBeNull();
		expect(screen.queryByText("Table view")).toBeNull();
		expect(screen.queryByText("Tree View")).toBeNull();

		// Level 1 expanded by default -> level 2 children visible, level 3 collapsed
		expect(screen.getByText("Productive")).toBeTruthy();
		expect(screen.getByText("Social")).toBeTruthy();
		expect(screen.getByText("Agriculture")).toBeTruthy();
		expect(screen.getByText("Education")).toBeTruthy();
		expect(screen.getByText("Housing")).toBeTruthy();
		expect(screen.queryByText("Urban housing")).toBeNull();

		// Footer shows total count
		expect(screen.getByText("6 sectors")).toBeTruthy();
	});

	it("expands all and collapses all via toolbar ghost buttons", async () => {
		const user = userEvent.setup();
		render(<SectorsPage sectors={SAMPLE_SECTORS} lang="en" />);

		await user.click(screen.getByRole("button", { name: "Expand all" }));
		expect(screen.getByText("Urban housing")).toBeTruthy();
		expect(screen.getByText("Sub-sector")).toBeTruthy();

		await user.click(screen.getByRole("button", { name: "Collapse all" }));
		expect(screen.queryByText("Housing")).toBeNull();
		expect(screen.queryByText("Agriculture")).toBeNull();
	});

	it("filters by name only, auto-expands matches, disables Expand/Collapse all, and restores previous expansion on clear", async () => {
		const user = userEvent.setup();
		render(<SectorsPage sectors={SAMPLE_SECTORS} lang="en" />);

		// Collapse all first so we can verify restoration after clearing search
		await user.click(screen.getByRole("button", { name: "Collapse all" }));
		expect(screen.queryByText("Housing")).toBeNull();

		const searchInput = screen.getByRole("searchbox", {
			name: "Search sectors",
		});
		await user.type(searchInput, "urban");

		// Matching leaf and ancestors are visible and auto-expanded
		expect(screen.getByText("Social")).toBeTruthy();
		expect(screen.getByText("Housing")).toBeTruthy();
		expect(screen.getByText("Urban housing")).toBeTruthy();
		expect(screen.queryByText("Productive")).toBeNull();
		expect(screen.getByText("3 sectors match your search")).toBeTruthy();

		// Expand all and Collapse all are disabled while searching
		expect(
			(screen.getByRole("button", { name: "Expand all" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			(
				screen.getByRole("button", {
					name: "Collapse all",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);

		// Clear search -> restores collapsed pre-search state and re-enables buttons
		await user.clear(searchInput);
		expect(screen.queryByText("Housing")).toBeNull();
		expect(screen.getByText("6 sectors")).toBeTruthy();
		expect(
			(screen.getByRole("button", { name: "Expand all" }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
	});

	it("retains children of a matching parent and ignores description-only matches", async () => {
		const user = userEvent.setup();
		render(<SectorsPage sectors={SAMPLE_SECTORS} lang="en" />);

		const searchInput = screen.getByRole("searchbox", {
			name: "Search sectors",
		});

		// Parent match retains its children
		await user.type(searchInput, "Social");
		expect(screen.getByText("Education")).toBeTruthy();
		expect(screen.getByText("Housing")).toBeTruthy();
		expect(screen.getByText("Urban housing")).toBeTruthy();
		expect(screen.getByText("4 sectors match your search")).toBeTruthy();

		// Description-only term ("universities") does not match
		await user.clear(searchInput);
		await user.type(searchInput, "universities");
		expect(screen.getByText('No sectors match "universities".')).toBeTruthy();
		expect(screen.getByText("0 sectors match your search")).toBeTruthy();
	});

	it("renders empty catalog state when database returns zero sectors", () => {
		render(<SectorsPage sectors={[]} lang="en" />);
		expect(screen.getByText("No sectors available.")).toBeTruthy();
		expect(screen.getByText("0 sectors")).toBeTruthy();
	});

	it("renders singular footer counts and level-4 Category label", async () => {
		const user = userEvent.setup();
		render(
			<SectorsPage
				sectors={[
					{
						id: "s-only",
						name: "Cereals",
						description: "Maize and rice.",
						level: 4,
						parentId: null,
					},
				]}
				lang="en"
			/>,
		);
		expect(screen.getByText("Category")).toBeTruthy();
		expect(screen.getByText("1 sector")).toBeTruthy();

		const searchInput = screen.getByRole("searchbox", {
			name: "Search sectors",
		});
		await user.type(searchInput, "cereals");
		expect(screen.getByText("1 sector matches your search")).toBeTruthy();
	});
});
