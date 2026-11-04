import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import type { ComponentType } from "react";
import type { TranslationGetter } from "~/utils/translator";
import type { HazardTaxonomyOptions } from "~/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase";
import type { HazardousEventHazardPickerProps } from "./HazardousEventHazardPicker";

const stubTranslationGetter: TranslationGetter = (params) => ({
	msg: params.msg ?? params.code,
});
vi.stubGlobal(
	"createTranslationGetter",
	(_lang: string) => stubTranslationGetter,
);

vi.mock("react-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router")>();
	return {
		...actual,
		useRouteLoaderData: vi.fn(() => ({ common: { lang: "en", user: null } })),
	};
});

// Render-count spy for design.md Decision 20 (HazardousEventHazardPicker re-rendering on every
// unrelated sibling-field edit, corrupting the native <select>'s own keyboard/type-ahead state).
// Wraps whatever the real module currently exports -- a plain function pre-fix, or a
// `React.memo`-wrapped component post-fix (`.type` holds its inner function in that case) -- so
// the SAME test asserts the real bug pre-fix and the real fix post-fix, without hardcoding either
// shape.
const hazardPickerRenderSpy = vi.fn();
vi.mock("./HazardousEventHazardPicker", async (importOriginal) => {
	const { memo, createElement } = await import("react");
	const actual =
		await importOriginal<typeof import("./HazardousEventHazardPicker")>();
	const RealExport = actual.HazardousEventHazardPicker;
	const isPlainFunction = typeof RealExport === "function";
	const Inner = (
		isPlainFunction
			? RealExport
			: (
					RealExport as unknown as {
						type: ComponentType<HazardousEventHazardPickerProps>;
					}
				).type
	) as ComponentType<HazardousEventHazardPickerProps>;
	function Spied(props: HazardousEventHazardPickerProps) {
		hazardPickerRenderSpy();
		return createElement(Inner, props);
	}
	return {
		...actual,
		HazardousEventHazardPicker: isPlainFunction ? Spied : memo(Spied),
	};
});

import { HazardousEventFormPage } from "./HazardousEventFormPage";

const hazardousEvents = {
	title: "Hazardous events",
	form: {
		create_title: "Add hazardous event",
		edit_title: "Edit hazardous event",
		fields: {
			select_type: "Select type",
			select_cluster: "Select cluster",
			select_specific_hazard: "Select specific hazard",
			spatial_footprint_placeholder: "placeholder",
			date_format_label: "Format",
			date_format_options: {
				full_date: "Full date",
				year_month: "Year and month",
				year_only: "Year only",
			},
			date_value_label: "Date",
			date_year_label: "Year",
			date_month_label: "Month",
			select_month: "Select",
			filter_by_hazard_name: "Filter by hazard name",
			hazard_type: "Hazard type",
			hazard_cluster: "Hazard cluster",
			specific_hazard: "Specific hazard",
		},
		actions: {
			change: "Change",
			unset: "Unset",
			save_or_submit: "Save or submit",
			discard: "Discard",
		},
		save_submit: {
			title: "Save or submit",
			decide_action: "Decide",
			select_validators: "Select validator(s)",
			publish_to_undrr: "Publish",
			publish_to_undrr_description: "desc",
			actions: {
				save_draft: "Save as draft",
				validate: "Validate record",
				validate_and_publish: "Validate and publish record",
				submit_for_validation: "Submit for validation",
			},
			descriptions: {
				save_draft: "d1",
				validate: "d2",
				submit_for_validation: "d3",
			},
			card_titles: { validate: "Validate" },
		},
		discard: {
			title: "Discard changes",
			confirm_message: "msg",
			save_as_draft: "Save as draft",
			discard_and_exit: "Discard work and exit",
		},
	},
	detail: {
		classification: {
			heading: "Hazard classification",
			type: "Type",
			cluster: "Cluster",
			hazard: "Hazard",
		},
		fields: {
			national_specification: "National specification",
			start_date: "Start date",
			end_date: "End date",
			description: "Description",
			chains_explanation: "Chains explanation",
			magnitude: "Magnitude",
			spatial_footprint: "Spatial footprint",
			attachments: "Attachments",
			record_originator: "Record originator",
			hazardous_event_status: "Hazardous event Status",
			data_source: "Data source",
		},
		hazardous_event_status_values: {
			forecasted: "Forecasted",
			ongoing: "Ongoing",
			passed: "Passed",
		},
	},
	list: { columns: { record_status: "Record status" } },
};

let testI18n: I18n;

async function setupI18n() {
	testI18n = i18n.createInstance();
	await testI18n.use(initReactI18next).init({
		lng: "en",
		fallbackLng: "en",
		ns: ["hazardous-events"],
		defaultNS: "hazardous-events",
		resources: { en: { "hazardous-events": hazardousEvents } },
	});
}

const EMPTY_TAXONOMY: HazardTaxonomyOptions = {
	types: [],
	clusters: [],
	specificHazards: [],
};

// One real option per level so a <select required> can actually resolve to a valid,
// non-empty value (9g's own fixture -- the other describe blocks never need a valid hazard).
const ONE_HAZARD_TAXONOMY: HazardTaxonomyOptions = {
	types: [{ id: "type-1", name: "Type 1" }],
	clusters: [{ id: "cluster-1", name: "Cluster 1", typeId: "type-1" }],
	specificHazards: [
		{ id: "hazard-1", name: "Hazard 1", clusterId: "cluster-1", code: "H1" },
	],
};

const VALID_INITIAL_VALUES = {
	specificHazardId: "hazard-1",
	startDate: "2026-01-01",
	endDate: "2026-01-02",
	nationalSpecification: "",
	description: "",
	chainsExplanation: "",
	magnitude: "",
	recordOriginator: "Test originator",
	dataSource: "",
	hazardousEventStatus: "ongoing" as const,
	attachments: [],
};

/** `<Form>` requires a data router, not a plain `<MemoryRouter>` (it calls `useSubmit()`
 * internally), so the page under test must be the router's own route element. */
function renderPage(element: React.ReactElement) {
	const router = createMemoryRouter([{ path: "/", element }]);
	return render(
		<I18nextProvider i18n={testI18n}>
			<RouterProvider router={router} />
		</I18nextProvider>,
	);
}

describe("HazardousEventFormPage visual-parity fixes (design.md Decision 9 Addendum 2)", () => {
	it("renders the <form> with the dts-form class (Gap 1 - padding parity)", async () => {
		await setupI18n();
		const { container } = renderPage(
			<HazardousEventFormPage
				mode="create"
				taxonomyOptions={EMPTY_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
			/>,
		);

		expect(container.querySelector("form")?.getAttribute("class")).toBe(
			"dts-form",
		);
	});

	it("renders a breadcrumb link to the list page before the form, and the create-mode h2 (Gap 2)", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="create"
				taxonomyOptions={EMPTY_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
			/>,
		);

		const breadcrumb = screen.getByRole("link", { name: "Hazardous events" });
		expect(breadcrumb.getAttribute("href")).toBe("/en/he-preview");
		expect(
			screen.getByRole("heading", {
				level: 2,
				name: "Add hazardous event",
			}),
		).toBeTruthy();
	});

	it("renders the edit-mode h2 (Gap 2)", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="edit"
				taxonomyOptions={EMPTY_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
				workflowStatus="DRAFT"
				initialValues={{
					specificHazardId: "",
					startDate: "",
					endDate: "",
					nationalSpecification: "",
					description: "",
					chainsExplanation: "",
					magnitude: "",
					recordOriginator: "",
					dataSource: "",
					hazardousEventStatus: null,
					attachments: [],
				}}
			/>,
		);

		expect(
			screen.getByRole("heading", {
				level: 2,
				name: "Edit hazardous event",
			}),
		).toBeTruthy();
	});

	it("wraps startDate/endDate in an mg-grid mg-grid__col-3 row (Decision 9 Addendum 3)", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="create"
				taxonomyOptions={EMPTY_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
			/>,
		);

		const startDateField = screen.getByLabelText("Start date Format");
		const row = startDateField.closest(".mg-grid");
		expect(row?.getAttribute("class")).toBe("mg-grid mg-grid__col-3");
	});

	it("renders recordOriginator with no extra wrapping div beyond dts-form-component (Gap 4/5 grouping)", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="create"
				taxonomyOptions={EMPTY_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
			/>,
		);

		const recordOriginatorInput = screen.getByLabelText("Record originator *");
		const fieldWrapper = recordOriginatorInput.closest(".dts-form-component");
		expect(fieldWrapper?.parentElement?.classList.contains("flex")).toBe(false);
	});

	it("wraps hazardousEventStatus in an mg-grid mg-grid__col-3 row (Decision 9 Addendum 3 -- confirmed live divergence, select stretch rule)", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="create"
				taxonomyOptions={EMPTY_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
			/>,
		);

		const statusSelect = screen.getByLabelText("Hazardous event Status");
		const row = statusSelect.closest(".mg-grid");
		expect(row?.getAttribute("class")).toBe("mg-grid mg-grid__col-3");
	});
});

describe("HazardousEventFormPage hazardousEventStatus default (product decision, not legacy parity)", () => {
	it("defaults to 'ongoing' on create when no initialValues are supplied", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="create"
				taxonomyOptions={EMPTY_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
			/>,
		);

		const select = screen.getByLabelText(
			"Hazardous event Status",
		) as HTMLSelectElement;
		expect(select.value).toBe("ongoing");
	});

	it("preserves an existing null hazardousEventStatus on edit -- never overridden by the create default", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="edit"
				taxonomyOptions={EMPTY_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
				workflowStatus="DRAFT"
				initialValues={{
					specificHazardId: "",
					startDate: "2026-01-01",
					endDate: "",
					nationalSpecification: "",
					description: "",
					chainsExplanation: "",
					magnitude: "",
					recordOriginator: "",
					dataSource: "",
					hazardousEventStatus: null,
					attachments: [],
				}}
			/>,
		);

		const select = screen.getByLabelText(
			"Hazardous event Status",
		) as HTMLSelectElement;
		expect(select.value).toBe("");
	});

	it("preserves an existing non-null hazardousEventStatus on edit unchanged", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="edit"
				taxonomyOptions={EMPTY_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
				workflowStatus="DRAFT"
				initialValues={{
					specificHazardId: "",
					startDate: "2026-01-01",
					endDate: "",
					nationalSpecification: "",
					description: "",
					chainsExplanation: "",
					magnitude: "",
					recordOriginator: "",
					dataSource: "",
					hazardousEventStatus: "forecasted",
					attachments: [],
				}}
			/>,
		);

		const select = screen.getByLabelText(
			"Hazardous event Status",
		) as HTMLSelectElement;
		expect(select.value).toBe("forecasted");
	});
});

describe("HazardousEventFormPage 'Save or submit' button disabled until natively valid (design.md Decision 18)", () => {
	it("(a) is disabled on initial render in create mode with no initialValues", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="create"
				taxonomyOptions={ONE_HAZARD_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
			/>,
		);

		const button = screen.getByRole("button", {
			name: "Save or submit",
		}) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
	});

	it("(b) is disabled on initial render in edit mode when a stored record is genuinely missing a required field (endDate: '')", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="edit"
				taxonomyOptions={ONE_HAZARD_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
				workflowStatus="DRAFT"
				initialValues={{ ...VALID_INITIAL_VALUES, endDate: "" }}
			/>,
		);

		const button = screen.getByRole("button", {
			name: "Save or submit",
		}) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
	});

	it("(c) [baseline/regression guard] is NOT disabled on initial render in edit mode when every required field already has a valid value", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="edit"
				taxonomyOptions={ONE_HAZARD_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
				workflowStatus="DRAFT"
				initialValues={VALID_INITIAL_VALUES}
			/>,
		);

		const button = screen.getByRole("button", {
			name: "Save or submit",
		}) as HTMLButtonElement;
		expect(button.disabled).toBe(false);
	});

	it("(d) toggles live as a required field is cleared and refilled, with no re-render/re-mount of the page", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="edit"
				taxonomyOptions={ONE_HAZARD_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
				workflowStatus="DRAFT"
				initialValues={VALID_INITIAL_VALUES}
			/>,
		);

		const button = screen.getByRole("button", {
			name: "Save or submit",
		}) as HTMLButtonElement;
		expect(button.disabled).toBe(false);

		const recordOriginator = screen.getByLabelText(
			"Record originator *",
		) as HTMLInputElement;

		// The recheck is deferred (queueMicrotask, design.md Decision 18) -- waitFor polls past
		// that defer instead of asserting synchronously right after fireEvent.
		fireEvent.input(recordOriginator, { target: { value: "" } });
		fireEvent.change(recordOriginator, { target: { value: "" } });
		await waitFor(() => expect(button.disabled).toBe(true));

		fireEvent.input(recordOriginator, { target: { value: "Someone" } });
		fireEvent.change(recordOriginator, { target: { value: "Someone" } });
		await waitFor(() => expect(button.disabled).toBe(false));
	});

	// Proves the deferred-recheck decision specifically (design.md Decision 18's "why deferred"
	// rationale), not just "a recheck happens somehow". Empirically verified at implementation
	// time (not assumed) which control actually reproduces the stale-read hazard: a Format switch
	// on HazardousEventFlexibleDateField does NOT reproduce it -- `parts.y/m/d` persist atomically
	// across a precision change (the newly-mounted control's `defaultValue` carries the old,
	// still-valid value forward), so no field ever goes from valid to empty by that path alone.
	// HazardousEventHazardPicker's own filter-by-name text input does reproduce it: typing into it
	// resets `specificHazardId` to "" via React state, which (because the <select required> is
	// *controlled* by that state) force-clears the select's own DOM value on React's commit -- a
	// change the native "input" event's own target (the filter box) never carries directly. See
	// design.md Decision 18's addendum for the full writeup of this correction.
	it("becomes disabled when typing in the hazard filter clears a previously-valid specificHazardId selection, via the deferred recheck (not a synchronous one)", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="edit"
				taxonomyOptions={ONE_HAZARD_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
				workflowStatus="DRAFT"
				initialValues={VALID_INITIAL_VALUES}
			/>,
		);

		const button = screen.getByRole("button", {
			name: "Save or submit",
		}) as HTMLButtonElement;
		expect(button.disabled).toBe(false);

		const filterInput = screen.getByPlaceholderText("Filter by hazard name");
		fireEvent.input(filterInput, { target: { value: "x" } });

		// Immediately after the event (same tick, before the queued microtask has run): the
		// recheck is still pending, so the button has NOT yet caught up to the now-invalid
		// select -- the observable artifact of deferring, asserted explicitly so this test fails
		// loudly if a future change makes the recheck synchronous again.
		expect(button.disabled).toBe(false);

		await waitFor(() => expect(button.disabled).toBe(true));
	});

	it("(9g.4, confirmation only) becomes enabled when selecting a valid hazard via the descendant HazardousEventHazardPicker's own <select>", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="edit"
				taxonomyOptions={ONE_HAZARD_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
				workflowStatus="DRAFT"
				initialValues={{ ...VALID_INITIAL_VALUES, specificHazardId: "" }}
			/>,
		);

		const button = screen.getByRole("button", {
			name: "Save or submit",
		}) as HTMLButtonElement;
		expect(button.disabled).toBe(true);

		fireEvent.change(document.getElementById("specificHazardId")!, {
			target: { value: "hazard-1" },
		});

		await waitFor(() => expect(button.disabled).toBe(false));
	});
});

describe("HazardousEventHazardPicker memoization (design.md Decision 20)", () => {
	beforeEach(() => {
		hazardPickerRenderSpy.mockClear();
	});

	it("does not re-render HazardousEventHazardPicker when an unrelated required field (recordOriginator) is cleared and refilled via Decision 18's own recheck, even though that recheck still runs (the button still toggles)", async () => {
		await setupI18n();
		renderPage(
			<HazardousEventFormPage
				mode="edit"
				taxonomyOptions={ONE_HAZARD_TAXONOMY}
				validatorCandidates={[]}
				parent={null}
				workflowStatus="DRAFT"
				initialValues={VALID_INITIAL_VALUES}
			/>,
		);

		const button = screen.getByRole("button", {
			name: "Save or submit",
		}) as HTMLButtonElement;
		expect(button.disabled).toBe(false);
		expect(hazardPickerRenderSpy).toHaveBeenCalledTimes(1); // initial mount only

		const recordOriginator = screen.getByLabelText(
			"Record originator *",
		) as HTMLInputElement;

		fireEvent.input(recordOriginator, { target: { value: "" } });
		fireEvent.change(recordOriginator, { target: { value: "" } });
		// Proves Decision 18's recheck (and therefore HazardousEventFormPage's own re-render)
		// genuinely ran -- without this, the render-count assertion below would be vacuous.
		await waitFor(() => expect(button.disabled).toBe(true));

		fireEvent.input(recordOriginator, { target: { value: "Someone" } });
		fireEvent.change(recordOriginator, { target: { value: "Someone" } });
		await waitFor(() => expect(button.disabled).toBe(false));

		// HazardousEventHazardPicker's own props (taxonomyOptions, initialSpecificHazardId,
		// errors) never changed across either of the two re-renders above -- it must not have
		// re-rendered at all despite its parent re-rendering twice.
		expect(hazardPickerRenderSpy).toHaveBeenCalledTimes(1);
	});
});
