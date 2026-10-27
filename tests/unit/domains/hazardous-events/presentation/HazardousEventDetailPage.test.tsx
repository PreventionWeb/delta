import { describe, it, expect, vi, beforeAll } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import { TranslationGetter } from "~/utils/translator";
import type { HazardousEventDetailDto } from "~/domains/hazardous-events/application/dto/HazardousEventDetailDto";

// Satisfies useViewContext()'s unconditional .t build (kept only for .lang/.url here).
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

import { HazardousEventDetailPage } from "~/domains/hazardous-events/presentation/HazardousEventDetailPage";

// Inline mirror of locales/en/hazardous-events.json (Notices precedent — no file import).
const hazardousEvents = {
	title: "Hazardous events",
	list: { columns: { record_status: "Record status" } },
	status: {
		draft: "Draft",
		waiting_for_validation: "Waiting for validation",
		needs_revision: "Needs revision",
		validated: "Validated",
		rejected: "Rejected",
		published: "Published",
		missing: "Not yet determined",
	},
	detail: {
		id_label: "ID",
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
			chains_explanation: "Composite event - chains explanation",
			magnitude: "Magnitude",
			spatial_footprint: "Spatial footprint",
			attachments: "Attachments",
			record_originator: "Record originator",
			hazardous_event_status: "Hazardous event Status",
			data_source: "Data source",
			created_at: "Created at",
			updated_at: "Updated at",
		},
		spatial_observation: {
			none: "No spatial observation recorded",
			observation_time: "Observation time",
			note: "Note",
		},
		attachments_none: "No attachments",
		hazardous_event_status_values: {
			forecasted: "Forecasted",
			ongoing: "Ongoing",
			passed: "Passed",
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

function renderWithI18n(ui: React.ReactElement): string {
	return renderToString(
		<MemoryRouter initialEntries={["/en/he-preview/event-A"]}>
			<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>
		</MemoryRouter>,
	);
}

function makeDetail(
	overrides: Partial<HazardousEventDetailDto> = {},
): HazardousEventDetailDto {
	return {
		id: "event-A",
		tenantId: "tenant-1",
		specificHazardId: "hazard-1",
		startDate: "2026-01-01T00:00:00.000Z",
		endDate: "",
		nationalSpecification: "spec",
		description: "desc",
		chainsExplanation: "chains",
		magnitude: "5.2",
		recordOriginator: "originator",
		dataSource: "source",
		hazardousEventStatus: null,
		specificHazardLocalName: null,
		specificHazardNationalName: null,
		specificHazardName: null,
		hazardClusterName: null,
		hazardTypeName: null,
		apiImportId: null,
		createdByUserId: "user-1",
		updatedByUserId: null,
		submittedByUserId: null,
		submittedAt: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-02T00:00:00.000Z",
		hazardDriverIds: [],
		attachments: [],
		fieldValues: [],
		customFieldValues: [],
		workflowStatus: "APPROVED",
		currentSpatialObservation: null,
		...overrides,
	};
}

/** Strips React's SSR comment markers (`<!-- -->`) between JSX expression children, so field-order
 * assertions can compare plain text positions without worrying about them. */
function stripSsrComments(html: string): string {
	return html.replace(/<!--\s*-->/g, "");
}

describe("HazardousEventDetailPage", () => {
	it("renders the event's own id", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail({ id: "event-xyz" })} />,
		);

		expect(html).toContain("event-xyz");
	});

	it("renders the dts-form shell class", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail()} />,
		);

		expect(html).toMatch(/<form[^>]*class="dts-form"/);
	});

	// Human's deliberate deviation from legacy's own (inconsistent) bare-h2/bare-h5 treatment:
	// both headings get a unified, real `dts-heading-5` treatment instead (switched down from an
	// earlier `dts-heading-3` attempt -- too large per the human's own eyes), so they're visually
	// consistent with each other. Confirmed `dts-heading-5` exists in style-dts.css.
	it("renders both the in-content heading and the Hazard classification heading as h5.dts-heading-5", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail()} />,
		);

		expect(html).toMatch(
			/<h5 class="[^"]*dts-heading-5[^"]*">Hazardous events<\/h5>/,
		);
		expect(html).toMatch(
			/<h5 class="dts-heading-5">Hazard classification<\/h5>/,
		);
	});

	// Human decision: visible gap between the breadcrumb link and the in-content heading right
	// below it, which otherwise sit flush against each other. Tailwind utility class, not an
	// inline style -- reuses dts-heading-5's own 0.86rem margin scale.
	it("adds spacing between the breadcrumb link and the in-content heading via a Tailwind class", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail()} />,
		);

		expect(html).toMatch(/<h5 class="[^"]*mt-\[0\.86rem\][^"]*">/);
		expect(html).not.toMatch(/<h5[^>]*style=/);
	});

	// Human decision: new structural grouping (not legacy-matching) -- visible separation between
	// (1) the page heading + ID, (2) the classification block, and (3) everything else.
	it("adds spacing at the end of the first two logical groups", () => {
		const html = stripSsrComments(
			renderWithI18n(<HazardousEventDetailPage data={makeDetail()} />),
		);

		expect(html).toMatch(/<p class="mb-\[0\.86rem\]">ID:/);
		expect(html).toMatch(/<p class="mb-\[0\.86rem\]">Hazard:/);
	});

	// Human-captured, field-by-field, directly against the real legacy detail page: bold starts
	// at "Record status" and ends after "Data source" -- ID, the Hazard classification block, and
	// Created at/Updated at all stay plain, unlike every other field.
	it("does not bold ID, the Hazard classification block, or Created at/Updated at", () => {
		const html = stripSsrComments(
			renderWithI18n(<HazardousEventDetailPage data={makeDetail()} />),
		);

		expect(html).not.toMatch(/<strong>ID:<\/strong>/);
		expect(html).not.toMatch(/<strong>Type:<\/strong>/);
		expect(html).not.toMatch(/<strong>Cluster:<\/strong>/);
		expect(html).not.toMatch(/<strong>Hazard:<\/strong>/);
		expect(html).not.toMatch(/<strong>Created at:<\/strong>/);
		expect(html).not.toMatch(/<strong>Updated at:<\/strong>/);
	});

	it("bolds every field from Record status through Data source", () => {
		const html = stripSsrComments(
			renderWithI18n(<HazardousEventDetailPage data={makeDetail()} />),
		);

		for (const label of [
			hazardousEvents.list.columns.record_status,
			hazardousEvents.detail.fields.national_specification,
			hazardousEvents.detail.fields.start_date,
			hazardousEvents.detail.fields.end_date,
			hazardousEvents.detail.fields.description,
			hazardousEvents.detail.fields.chains_explanation,
			hazardousEvents.detail.fields.magnitude,
			hazardousEvents.detail.fields.spatial_footprint,
			hazardousEvents.detail.fields.attachments,
			hazardousEvents.detail.fields.record_originator,
			hazardousEvents.detail.fields.hazardous_event_status,
			hazardousEvents.detail.fields.data_source,
		]) {
			expect(html).toMatch(new RegExp(`<strong>${label}:</strong>`));
		}
	});

	// Human-captured exact legacy order: ID -> Hazard classification (Type/Cluster/Hazard) ->
	// Record status -> National specification -> Start/End date -> Description -> Composite event
	// chains -> Magnitude -> Spatial footprint -> Attachments -> Record originator -> Hazardous
	// event Status -> Data source -> Created at -> Updated at.
	it("renders fields in the exact legacy order", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail()} />,
		);

		const labels = [
			hazardousEvents.detail.id_label,
			hazardousEvents.detail.classification.heading,
			hazardousEvents.detail.classification.type,
			hazardousEvents.detail.classification.cluster,
			hazardousEvents.detail.classification.hazard,
			hazardousEvents.list.columns.record_status,
			hazardousEvents.detail.fields.national_specification,
			hazardousEvents.detail.fields.start_date,
			hazardousEvents.detail.fields.end_date,
			hazardousEvents.detail.fields.description,
			hazardousEvents.detail.fields.chains_explanation,
			hazardousEvents.detail.fields.magnitude,
			hazardousEvents.detail.fields.spatial_footprint,
			hazardousEvents.detail.fields.attachments,
			hazardousEvents.detail.fields.record_originator,
			hazardousEvents.detail.fields.hazardous_event_status,
			hazardousEvents.detail.fields.data_source,
			hazardousEvents.detail.fields.created_at,
			hazardousEvents.detail.fields.updated_at,
		];

		let lastIndex = -1;
		for (const label of labels) {
			const index = html.indexOf(label, lastIndex + 1);
			expect(index, `expected to find "${label}"`).toBeGreaterThan(-1);
			expect(
				index,
				`expected "${label}" to come after the previous field`,
			).toBeGreaterThan(lastIndex);
			lastIndex = index;
		}
	});

	// Root cause (human verified via computed styles): legacy wraps Start/End date in
	// `<div class="mg-grid mg-grid__col-3">`, a fixed-width 3-column CSS grid -- not approximable
	// with ad hoc flex/margin spacing, so this exact legacy utility class is reused directly.
	it("wraps Start date and End date in legacy's own mg-grid mg-grid__col-3", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail()} />,
		);

		const rowMatch = html.match(
			/<div class="mg-grid mg-grid__col-3">(?:(?!<\/div>).)*Start date(?:(?!<\/div>).)*End date(?:(?!<\/div>).)*<\/div>/,
		);
		expect(rowMatch).not.toBeNull();
	});

	// Relabeled per the human's direct capture: "Hazardous event Status" (capital S), not
	// "Event status" -- and repositioned between Record originator and Data source.
	it("labels the event-status field exactly 'Hazardous event Status'", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail()} />,
		);

		expect(html).toContain("Hazardous event Status");
		expect(html).not.toContain("Event status:");
	});

	// Human-confirmed divergence, fixed: legacy renders each enum value's own capitalized label
	// ("Forecasted"/"Ongoing"/"Passed"), not the raw lowercase enum string.
	it.each([
		["forecasted", "Forecasted"],
		["ongoing", "Ongoing"],
		["passed", "Passed"],
	] as const)(
		"renders the hazardousEventStatus label for %s as %s",
		(value, label) => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({ hazardousEventStatus: value })}
				/>,
			);

			expect(html).toContain(label);
		},
	);

	// Human-confirmed divergence, fixed: legacy shows "-" for every empty field value; the new
	// page rendered nothing after the colon instead.
	it("renders a dash for every empty string field, matching legacy", () => {
		const html = stripSsrComments(
			renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({
						nationalSpecification: "",
						description: "",
						chainsExplanation: "",
						magnitude: "",
						recordOriginator: "",
						dataSource: "",
						endDate: "",
					})}
				/>,
			),
		);

		for (const label of [
			hazardousEvents.detail.fields.national_specification,
			hazardousEvents.detail.fields.description,
			hazardousEvents.detail.fields.chains_explanation,
			hazardousEvents.detail.fields.magnitude,
			hazardousEvents.detail.fields.record_originator,
			hazardousEvents.detail.fields.data_source,
			hazardousEvents.detail.fields.end_date,
		]) {
			expect(html).toMatch(new RegExp(`${label}:</strong>\\s*-(?:</p>|\\s)`));
		}
	});

	it("renders a back-to-list link above the heading (the only way back, per Invariant 2)", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail()} />,
		);

		expect(html).toMatch(/<a[^>]*href="\/en\/he-preview"/);
	});

	it("renders a distinct indicator and label for a null workflowStatus (DEF-031)", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail({ workflowStatus: null })} />,
		);

		expect(html).toContain("var(--color-dts-status-missing)");
		expect(html).toContain(hazardousEvents.status.missing);
	});

	it("renders the real workflow status label when not null", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage
				data={makeDetail({ workflowStatus: "REVISION_REQUESTED" })}
			/>,
		);

		expect(html).toContain(hazardousEvents.status.needs_revision);
		expect(html).toMatch(/dts-status dts-status--needs-revision/);
	});

	it("falls back from specificHazardLocalName to specificHazardId for the hazard label", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage
				data={makeDetail({
					specificHazardLocalName: null,
					specificHazardNationalName: null,
					specificHazardId: "raw-id",
				})}
			/>,
		);

		expect(html).toContain("raw-id");
	});

	it("renders the specificHazardId fallback in a visually distinct style, not plain text", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage
				data={makeDetail({
					specificHazardLocalName: null,
					specificHazardNationalName: null,
					specificHazardId: "raw-id",
				})}
			/>,
		);

		expect(html).toMatch(/<span[^>]*font-family:monospace[^>]*>raw-id<\/span>/);
	});

	// Gate 9 finding: the legacy detail view renders every date field via formatDate's raw ISO
	// output (e.g. "2025-07-01"), not a human display format -- confirmed against a real
	// rendered legacy page, not assumed.
	it("renders dates in raw ISO (YYYY-MM-DD) format, matching the legacy detail view", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage
				data={makeDetail({
					startDate: "2025-07-01T00:00:00.000Z",
					createdAt: "2025-06-01T00:00:00.000Z",
				})}
			/>,
		);

		expect(html).toContain("2025-07-01");
		expect(html).toContain("2025-06-01");
		expect(html).not.toContain("1 Jul 2025");
	});

	it("renders all three resolved taxonomy levels under the Hazard classification heading", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage
				data={makeDetail({
					hazardTypeName: "Biological",
					hazardClusterName: "Infectious disease",
					specificHazardName: "Cholera",
				})}
			/>,
		);

		expect(html).toContain("Hazard classification");
		expect(html).toContain("Biological");
		expect(html).toContain("Infectious disease");
		expect(html).toContain("Cholera");
	});

	it("renders the attachments section with each attachment's title when present", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage
				data={makeDetail({
					attachments: [
						{
							id: "attachment-1",
							title: "Site survey photo",
							fileKey: "key-1",
							fileName: "survey.jpg",
							fileType: "image/jpeg",
							fileSize: 100,
						},
					],
				})}
			/>,
		);

		expect(html).toContain("Attachments");
		expect(html).toContain("Site survey photo");
	});

	it("renders the attachments section's empty state when there are none", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail({ attachments: [] })} />,
		);

		expect(html).toContain("No attachments");
	});

	it("renders the spatial observation section's empty state when none is recorded", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage
				data={makeDetail({ currentSpatialObservation: null })}
			/>,
		);

		expect(html).toContain("No spatial observation recorded");
	});

	it("renders the current spatial observation's time when one is recorded", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage
				data={makeDetail({
					currentSpatialObservation: {
						id: "obs-1",
						hazardousEventId: "event-A",
						observationTime: "2026-02-01T00:00:00.000Z",
						note: "Flooded road",
						geometries: [],
						divisionIds: [],
						createdAt: "2026-02-01T00:00:00.000Z",
						updatedAt: "2026-02-01T00:00:00.000Z",
					},
				})}
			/>,
		);

		expect(html).toContain("2026-02-01");
		expect(html).toContain("Flooded road");
	});
});
