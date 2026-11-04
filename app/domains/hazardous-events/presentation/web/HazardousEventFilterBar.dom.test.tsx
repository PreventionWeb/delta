import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import type { HazardTaxonomyOptions } from "~/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase";
import type { HazardousEventListFilterInput } from "~/domains/hazardous-events/application/use-cases/ListHazardousEvents";
import { HazardousEventFilterBar } from "./HazardousEventFilterBar";

// Mirrors locales/en/hazardous-events.json's "filters"/"status" keys.
const hazardousEvents = {
	filters: {
		hazard_type: "Hazard type",
		cluster: "Cluster",
		specific_hazard: "Specific hazard",
		from: "From",
		to: "To",
		recording_organization: "Recording organization",
		hazardous_event_status: "Hazardous event status",
		record_status: "Record status",
		view_my_records: "View my records",
		pending_my_action: "Pending my action",
		clear: "Clear",
		apply_filters: "Apply filters",
	},
	status: {
		draft: "Draft",
		waiting_for_validation: "Waiting for validation",
		needs_revision: "Needs revision",
		validated: "Validated",
		rejected: "Rejected",
		published: "Published",
	},
	detail: {
		hazardous_event_status_values: {
			forecasted: "Forecasted",
			ongoing: "Ongoing",
			passed: "Passed",
		},
	},
};

const SAMPLE_TAXONOMY: HazardTaxonomyOptions = {
	types: [
		{ id: "type-1", name: "Meteorological" },
		{ id: "type-2", name: "Geophysical" },
	],
	clusters: [
		{ id: "cluster-1", typeId: "type-1", name: "Storm" },
		{ id: "cluster-2", typeId: "type-2", name: "Seismic" },
	],
	specificHazards: [
		{ id: "hazard-1", clusterId: "cluster-1", name: "Cyclone", code: "MH0001" },
		{
			id: "hazard-2",
			clusterId: "cluster-2",
			name: "Earthquake",
			code: "GH0001",
		},
	],
};

let testI18n: I18n;

beforeAll(async () => {
	testI18n = i18n.createInstance();
	await testI18n.use(initReactI18next).init({
		lng: "en",
		fallbackLng: "en",
		ns: ["hazardous-events"],
		defaultNS: "hazardous-events",
		resources: { en: { "hazardous-events": hazardousEvents } },
	});
});

interface RenderOverrides {
	taxonomyOptions?: HazardTaxonomyOptions;
	role?: string | null;
	clearFiltersUrl?: string;
	currentPageSize?: number;
	currentFilters?: HazardousEventListFilterInput;
}

function renderBar(overrides: RenderOverrides = {}) {
	const props = {
		taxonomyOptions: SAMPLE_TAXONOMY,
		role: "data-collector",
		clearFiltersUrl: "/en/he-preview",
		currentPageSize: 10,
		...overrides,
	};
	return render(
		<MemoryRouter>
			<I18nextProvider i18n={testI18n}>
				<HazardousEventFilterBar {...props} />
			</I18nextProvider>
		</MemoryRouter>,
	);
}

describe("HazardousEventFilterBar", () => {
	it("renders exactly one of each documented field", () => {
		const { container } = renderBar({ role: "data-collector" });

		expect(screen.getByRole("button", { name: /hazard type/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /cluster/i })).toBeTruthy();
		expect(
			screen.getByRole("combobox", { name: /specific hazard/i }),
		).toBeTruthy();
		expect(container.querySelector('input[name="fromDate"]')).not.toBeNull();
		expect(container.querySelector('input[name="toDate"]')).not.toBeNull();
		expect(
			screen.getByRole("textbox", { name: /recording organization/i }),
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /hazardous event status/i }),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: /record status/i })).toBeTruthy();
		expect(screen.getAllByRole("checkbox")).toHaveLength(2);
	});

	it("mine checkboxes are absent for a data-viewer role", () => {
		renderBar({ role: "data-viewer" });

		expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
	});

	it("mine checkboxes are present for a role that can add records", () => {
		renderBar({ role: "data-collector" });

		expect(screen.getAllByRole("checkbox")).toHaveLength(2);
		expect(
			screen.getByRole("checkbox", { name: /view my records/i }),
		).toBeTruthy();
		expect(
			screen.getByRole("checkbox", { name: /pending my action/i }),
		).toBeTruthy();
	});

	it("record-status options are restricted to Validated/Published for a data-viewer role", async () => {
		const user = userEvent.setup();
		renderBar({ role: "data-viewer" });

		await user.click(screen.getByRole("button", { name: /record status/i }));
		await screen.findByRole("listbox");

		// 2 status options + the "All record statuses" placeholder every Select in this form has
		// (tasks.md Task 9.2's own field spec) -- the spec's "contains only ... APPROVED and
		// PUBLISHED" is about the status-backed options, not the placeholder.
		const options = screen.getAllByRole("option");
		expect(options).toHaveLength(3);
		const texts = options.map((option) => option.textContent);
		expect(texts).toEqual(expect.arrayContaining(["Validated", "Published"]));
	});

	it("record-status options are unrestricted for a non-data-viewer role", async () => {
		const user = userEvent.setup();
		renderBar({ role: "data-collector" });

		await user.click(screen.getByRole("button", { name: /record status/i }));
		await screen.findByRole("listbox");

		// 6 status options + the "All record statuses" placeholder (same reasoning as the
		// data-viewer-restricted scenario above).
		const options = screen.getAllByRole("option");
		expect(options).toHaveLength(7);
		const texts = options.map((option) => option.textContent);
		expect(texts).toEqual(
			expect.arrayContaining([
				"Draft",
				"Waiting for validation",
				"Needs revision",
				"Validated",
				"Published",
				"Rejected",
			]),
		);
	});

	it("includes a hidden pageSize field carrying the current value, and no page field", () => {
		const { container } = renderBar({ currentPageSize: 25 });

		const pageSizeInput = container.querySelector(
			'input[type="hidden"][name="pageSize"]',
		) as HTMLInputElement | null;
		expect(pageSizeInput).not.toBeNull();
		expect(pageSizeInput?.value).toBe("25");
		expect(container.querySelector('input[name="page"]')).toBeNull();
	});

	it("the Clear control's target has no query string", () => {
		renderBar({ clearFiltersUrl: "/en/he-preview" });

		const clearLink = screen.getByRole("link", { name: /clear/i });
		expect(clearLink.getAttribute("href")).toBe("/en/he-preview");
	});

	it("renders an Apply filters submit button", () => {
		renderBar();

		const button = screen.getByRole("button", { name: /apply filters/i });
		expect(button.getAttribute("type")).toBe("submit");
	});

	// Regression (SOLID-review finding): a URL-loaded specificHazardId must not resurface after
	// changing Type, which remounts the Combobox and previously re-seeded it from the original prop.
	it("clears the selected specific hazard after changing Hazard type, even when the URL pre-selected one", async () => {
		const user = userEvent.setup();
		const { container } = renderBar({
			currentFilters: {
				hazardTypeId: "type-1",
				hazardClusterId: "cluster-1",
				specificHazardId: "hazard-1",
			},
		});

		const hiddenInput = () =>
			container.querySelector(
				'input[type="hidden"][name="specificHazardId"]',
			) as HTMLInputElement | null;
		expect(hiddenInput()?.value).toBe("hazard-1");

		await user.click(screen.getByRole("button", { name: /hazard type/i }));
		await screen.findByRole("listbox");
		await user.click(screen.getByRole("option", { name: "Geophysical" }));

		expect(hiddenInput()?.value ?? "").toBe("");
	});

	// Regression (code review): Selects must only remount on an EXTERNAL driver, not their own
	// change, or focus drops. RAC restores focus async, hence waitFor (see Select.test.tsx).
	it("keeps keyboard focus on the Hazard type trigger after selecting an option", async () => {
		const user = userEvent.setup();
		renderBar();

		const trigger = screen.getByRole("button", { name: /hazard type/i });
		await user.click(trigger);
		await screen.findByRole("listbox");
		await user.click(screen.getByRole("option", { name: "Geophysical" }));

		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});

	it("fills Cluster and Hazard type upward when a specific hazard is selected directly (design.md Decision 10)", async () => {
		const user = userEvent.setup();
		const { container } = renderBar();

		const combo = screen.getByRole("combobox", { name: /specific hazard/i });
		await user.click(combo);
		await user.type(combo, "Earthquake");
		await screen.findByRole("option", { name: "Earthquake" });
		await user.click(screen.getByRole("option", { name: "Earthquake" }));

		const hiddenTypeInput = container.querySelector(
			'select[name="hazardTypeId"]',
		) as HTMLSelectElement | null;
		const hiddenClusterInput = container.querySelector(
			'select[name="hazardClusterId"]',
		) as HTMLSelectElement | null;
		expect(hiddenTypeInput?.value).toBe("type-2");
		expect(hiddenClusterInput?.value).toBe("cluster-2");
	});

	// Mutation-audit gap: narrowing (handleTypeChange's filteredClusters) had no assertion.
	it("narrows the Cluster options to the selected Hazard type's own clusters", async () => {
		const user = userEvent.setup();
		renderBar();

		await user.click(screen.getByRole("button", { name: /hazard type/i }));
		await screen.findByRole("listbox");
		await user.click(screen.getByRole("option", { name: "Meteorological" }));

		await user.click(screen.getByRole("button", { name: /cluster/i }));
		await screen.findByRole("listbox");
		const texts = screen.getAllByRole("option").map((o) => o.textContent);
		expect(texts).toContain("Storm");
		expect(texts).not.toContain("Seismic");
	});

	// Mutation-audit gap: narrowing (handleClusterChange's filteredHazards) had no assertion.
	it("narrows the Specific hazard options to the selected Cluster's own hazards", async () => {
		const user = userEvent.setup();
		renderBar();

		await user.click(screen.getByRole("button", { name: /cluster/i }));
		await screen.findByRole("listbox");
		await user.click(screen.getByRole("option", { name: "Storm" }));

		// "e" matches both sample hazards' names ("Cyclone"/"Earthquake") -- only Storm's own
		// hazard should appear if narrowing by cluster actually ran.
		const combo = screen.getByRole("combobox", { name: /specific hazard/i });
		await user.click(combo);
		await user.type(combo, "e");
		await screen.findByRole("option", { name: "Cyclone" });
		const texts = screen.getAllByRole("option").map((o) => o.textContent);
		expect(texts).toContain("Cyclone");
		expect(texts).not.toContain("Earthquake");
	});

	// Mutation-audit gap: hazardousEventStatus's own option list had no content assertion.
	it("lists all three hazardous-event-status options, unrestricted for a data-viewer role", async () => {
		const user = userEvent.setup();
		renderBar({ role: "data-viewer" });

		await user.click(
			screen.getByRole("button", { name: /hazardous event status/i }),
		);
		await screen.findByRole("listbox");

		const options = screen.getAllByRole("option");
		expect(options).toHaveLength(4);
		const texts = options.map((option) => option.textContent);
		expect(texts).toEqual(
			expect.arrayContaining(["Forecasted", "Ongoing", "Passed"]),
		);
	});

	it("lists all three hazardous-event-status options for a non-data-viewer role", async () => {
		const user = userEvent.setup();
		renderBar({ role: "data-collector" });

		await user.click(
			screen.getByRole("button", { name: /hazardous event status/i }),
		);
		await screen.findByRole("listbox");

		const options = screen.getAllByRole("option");
		expect(options).toHaveLength(4);
		const texts = options.map((option) => option.textContent);
		expect(texts).toEqual(
			expect.arrayContaining(["Forecasted", "Ongoing", "Passed"]),
		);
	});

	it("resets the specific hazard combobox after changing Cluster directly", async () => {
		const user = userEvent.setup();
		const { container } = renderBar({
			currentFilters: {
				hazardClusterId: "cluster-1",
				specificHazardId: "hazard-1",
			},
		});

		const hiddenInput = () =>
			container.querySelector(
				'input[type="hidden"][name="specificHazardId"]',
			) as HTMLInputElement | null;
		expect(hiddenInput()?.value).toBe("hazard-1");

		await user.click(screen.getByRole("button", { name: /cluster/i }));
		await screen.findByRole("listbox");
		await user.click(screen.getByRole("option", { name: "Seismic" }));

		expect(hiddenInput()?.value ?? "").toBe("");
	});
});
