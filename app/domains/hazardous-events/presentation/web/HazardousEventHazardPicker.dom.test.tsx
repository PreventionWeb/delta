import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import type { HazardTaxonomyOptions } from "~/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase";
import { HazardousEventHazardPicker } from "./HazardousEventHazardPicker";

const hazardousEvents = {
	detail: {
		classification: {
			heading: "Hazard classification",
			type: "Type",
			cluster: "Cluster",
			hazard: "Hazard",
		},
	},
	form: {
		fields: {
			select_type: "Select type",
			select_cluster: "Select cluster",
			select_specific_hazard: "Select specific hazard",
			filter_by_hazard_name: "Filter by hazard name",
			hazard_type: "Hazard type",
			hazard_cluster: "Hazard cluster",
			specific_hazard: "Specific hazard",
		},
	},
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

const OPTIONS: HazardTaxonomyOptions = {
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
			id: "hazard-surge",
			clusterId: "cluster-coastal",
			name: "Storm surge",
			code: "FL02",
		},
		{
			id: "hazard-tornado",
			clusterId: "cluster-wind",
			name: "Tornado",
			code: "ST01",
		},
	],
};

function renderPicker(initialSpecificHazardId = "") {
	return render(
		<I18nextProvider i18n={testI18n}>
			<HazardousEventHazardPicker
				taxonomyOptions={OPTIONS}
				initialSpecificHazardId={initialSpecificHazardId}
			/>
		</I18nextProvider>,
	);
}

describe("HazardousEventHazardPicker (design.md Decision 9, Gate 9 finding -- legacy's hazardpicker.tsx filter box)", () => {
	it("renders a 'Filter by hazard name' text input above the three selects", () => {
		renderPicker();
		expect(screen.getByLabelText("Filter by hazard name")).toBeTruthy();
	});

	it("filters the specific-hazard select by name with no type/cluster chosen first", async () => {
		const user = userEvent.setup();
		renderPicker();

		await user.type(screen.getByLabelText("Filter by hazard name"), "surge");

		// Required marker added (design.md Decision 19) -- "Specific hazard *" is the field's
		// real accessible name now.
		const hazardSelect = screen.getByLabelText(
			"Specific hazard *",
		) as HTMLSelectElement;
		const optionTexts = Array.from(hazardSelect.options).map((o) => o.text);
		expect(optionTexts).toContain("Storm surge");
		expect(optionTexts).not.toContain("Flash flood");
		expect(optionTexts).not.toContain("Tornado");
	});

	it("never disables the cluster select, even with no type chosen", () => {
		renderPicker();
		expect(
			(screen.getByLabelText("Hazard cluster") as HTMLSelectElement).disabled,
		).toBe(false);
	});

	it("picking a hazard directly back-fills its cluster and type", async () => {
		const user = userEvent.setup();
		renderPicker();

		await user.selectOptions(
			screen.getByLabelText("Specific hazard *"),
			"hazard-surge",
		);

		expect(
			(screen.getByLabelText("Hazard cluster") as HTMLSelectElement).value,
		).toBe("cluster-coastal");
		expect(
			(screen.getByLabelText("Hazard type") as HTMLSelectElement).value,
		).toBe("type-flood");
	});

	it("picking a cluster back-fills its type", async () => {
		const user = userEvent.setup();
		renderPicker();

		await user.selectOptions(
			screen.getByLabelText("Hazard cluster"),
			"cluster-wind",
		);

		expect(
			(screen.getByLabelText("Hazard type") as HTMLSelectElement).value,
		).toBe("type-storm");
	});

	it("clears the type/cluster/hazard selection when the filter text changes", async () => {
		const user = userEvent.setup();
		renderPicker();

		await user.selectOptions(
			screen.getByLabelText("Specific hazard *"),
			"hazard-surge",
		);
		expect(
			(screen.getByLabelText("Hazard type") as HTMLSelectElement).value,
		).toBe("type-flood");

		await user.type(screen.getByLabelText("Filter by hazard name"), "x");

		expect(
			(screen.getByLabelText("Hazard type") as HTMLSelectElement).value,
		).toBe("");
		expect(
			(screen.getByLabelText("Hazard cluster") as HTMLSelectElement).value,
		).toBe("");
		expect(
			(screen.getByLabelText("Specific hazard *") as HTMLSelectElement).value,
		).toBe("");
	});

	it("renders only the single surviving type option, with no placeholder, when exactly one type matches the filter (legacy's own quirk, replicated exactly)", async () => {
		const user = userEvent.setup();
		renderPicker();

		await user.type(screen.getByLabelText("Filter by hazard name"), "flood");

		const typeSelect = screen.getByLabelText(
			"Hazard type",
		) as HTMLSelectElement;
		expect(typeSelect.options.length).toBe(1);
		expect(typeSelect.options[0].value).toBe("type-flood");
	});
});

describe("HazardousEventHazardPicker visual-parity fixes (design.md Decision 9 Addendum 2, Gaps 3/4/5)", () => {
	it("renders real visible <label> text for the three selects, not just aria-label (Gap 3)", () => {
		renderPicker();

		expect(screen.getByText("Hazard type")).toBeTruthy();
		expect(screen.getByText("Hazard cluster")).toBeTruthy();
		// "Specific hazard *" (design.md Decision 19 -- the field's own required marker).
		expect(screen.getByText("Specific hazard *")).toBeTruthy();
	});

	it("wraps the three selects in an mg-grid mg-grid__col-3 row, not a flex row (Gap 4/5 grouping)", () => {
		renderPicker();

		const row = screen.getByLabelText("Hazard type").closest(".mg-grid");
		expect(row?.getAttribute("class")).toBe("mg-grid mg-grid__col-3");
	});
});

describe("HazardousEventHazardPicker required-marker parity (design.md Decision 19)", () => {
	it("shows the 'Specific hazard' field's own required marker, alongside the group heading's own", () => {
		renderPicker();

		expect(screen.getByText("Specific hazard *")).toBeTruthy();
		expect(screen.getByText("Hazard classification *")).toBeTruthy();
	});

	it("shows no required marker on 'Hazard type' or 'Hazard cluster'", () => {
		renderPicker();

		expect(screen.getByText("Hazard type")).toBeTruthy();
		expect(screen.getByText("Hazard cluster")).toBeTruthy();
		expect(screen.queryByText("Hazard type *")).toBeNull();
		expect(screen.queryByText("Hazard cluster *")).toBeNull();
	});
});
