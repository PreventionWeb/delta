import { describe, it, expect, vi, beforeAll } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import { TranslationGetter } from "~/utils/translator";
import type { HazardousEventDetailDto } from "~/domains/hazardous-events/application/dto/HazardousEventDetailDto";

// Satisfies useViewContext()'s .t build. Always returns its given `msg` verbatim, so
// assertions compare against the literal copy.
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

import { HazardousEventDetailPage } from "~/domains/hazardous-events/presentation/web/HazardousEventDetailPage";

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
		back_to_list: "Back to Hazardous events",
		sections: {
			basic_information: "Basic information",
			hazard_details: "Hazard details",
			location: "Location",
			attachments: "Attachments",
			linked_events: "Linked events",
			audit_log_history: "Audit log history",
		},
		classification: {
			heading: "Hazard classification",
		},
		fields: {
			uuid: "UUID",
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
			hazard_type: "Hazard type",
			hazard_cluster: "Hazard cluster",
			specific_hazard: "Specific hazard",
		},
		spatial_observation: {
			none: "No spatial observation recorded",
			observation_time: "Observation time",
			note: "Note",
			map_label: "Spatial footprint map",
		},
		linked_events: {
			caused_by: "Caused by",
			causing: "Causing",
			no_cause: "No cause recorded",
			no_effects: "No effects recorded",
			hip_label: "HIP",
			uuid_label: "UUID",
			unresolved_event: "Hazardous event",
		},
		audit_log: {
			empty: "No audit log history recorded",
			columns: {
				action_taken: "Action taken",
				by: "By",
				organisation: "Organisation",
				date: "Date",
				time: "Time",
			},
			// Distinguishable from the raw action string, so a passing assertion proves t() was called, not a pass-through (design.md Decision 15).
			actions: {
				create: "CREATED: {{obj}}",
				update: "UPDATED: {{obj}}",
				delete: "DELETED: {{obj}}",
			},
			object_hazardous_event: "HE",
		},
		attachments_table: {
			columns: {
				title: "Title",
				tags: "Tags",
				file_url: "File/URL",
			},
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
		specificHazardCode: null,
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
		cause: null,
		effects: [],
		auditLog: [],
		...overrides,
	};
}

/** Strips React's SSR comment markers (`<!-- -->`) between JSX expression children, so field-order
 * assertions can compare plain text positions without worrying about them. */
function stripSsrComments(html: string): string {
	return html.replace(/<!--\s*-->/g, "");
}

/** Slices rendered HTML to one Card's own content, bounded by its heading text and the next
 * Card heading (or end of document for the last Card). */
function cardHtml(html: string, heading: string, nextHeading?: string): string {
	const start = html.indexOf(`>${heading}</h2>`);
	expect(start, `expected to find Card heading "${heading}"`).toBeGreaterThan(
		-1,
	);
	const end = nextHeading ? html.indexOf(`>${nextHeading}</h2>`) : html.length;
	expect(end, `expected to find Card heading "${nextHeading}"`).toBeGreaterThan(
		start,
	);
	return html.slice(start, end);
}

describe("HazardousEventDetailPage", () => {
	it("renders the dts-form shell class", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail()} />,
		);

		expect(html).toMatch(/<form[^>]*class="dts-form"/);
	});

	it("renders a back-to-list link above the heading (the only way back, per Invariant 2)", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail()} />,
		);

		expect(html).toMatch(/<a[^>]*href="\/en\/he-preview"[^>]*>/);
		expect(html).toContain(hazardousEvents.detail.back_to_list);
		const linkMatch = html.match(/<a[^>]*href="\/en\/he-preview"[^>]*>/);
		expect(linkMatch?.[0]).toContain("rounded-[6px]");
		expect(linkMatch?.[0]).toContain("border-blue-500");
	});

	it("wraps the back-link in an mb-4 element, separating it from the first Card (design.md Decision 12)", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail()} />,
		);

		const backLinkIndex = html.indexOf(hazardousEvents.detail.back_to_list);
		const wrapperStart = html.lastIndexOf("<div", backLinkIndex);
		const wrapperTag = html.slice(
			wrapperStart,
			html.indexOf(">", wrapperStart) + 1,
		);
		expect(wrapperTag).toContain("mb-4");
	});

	it("wraps the six Cards in a shared space-y-6 div, placed immediately after the back-link's own mb-4 wrapper, distinct from it (design.md Decision 16, Fix 1)", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail()} />,
		);

		const backLinkIndex = html.indexOf(hazardousEvents.detail.back_to_list);
		const backLinkWrapperEnd =
			html.indexOf("</div>", backLinkIndex) + "</div>".length;

		expect(html.slice(backLinkWrapperEnd)).toMatch(/^<div class="space-y-6">/);

		const basicInfoHeadingIndex = html.indexOf(
			`>${hazardousEvents.detail.sections.basic_information}</h2>`,
		);
		expect(basicInfoHeadingIndex).toBeGreaterThan(backLinkWrapperEnd);

		const auditLogHeadingIndex = html.indexOf(
			`>${hazardousEvents.detail.sections.audit_log_history}</h2>`,
		);
		expect(auditLogHeadingIndex).toBeGreaterThan(basicInfoHeadingIndex);

		// The shared wrapper closes right before the form itself does -- it's the outermost
		// thing wrapping the last (audit log) Card's own closing </section>.
		expect(html.endsWith("</section></div></form>")).toBe(true);
	});

	it("renders all six Card sections in the exact spec order", () => {
		const html = renderWithI18n(
			<HazardousEventDetailPage data={makeDetail()} />,
		);

		const headings = [
			hazardousEvents.detail.sections.basic_information,
			hazardousEvents.detail.sections.hazard_details,
			hazardousEvents.detail.sections.location,
			hazardousEvents.detail.sections.attachments,
			hazardousEvents.detail.sections.linked_events,
			hazardousEvents.detail.sections.audit_log_history,
		];

		let lastIndex = -1;
		for (const heading of headings) {
			const index = html.indexOf(`>${heading}</h2>`, lastIndex + 1);
			expect(
				index,
				`expected to find Card heading "${heading}"`,
			).toBeGreaterThan(-1);
			expect(
				index,
				`expected "${heading}" to come after the previous Card`,
			).toBeGreaterThan(lastIndex);
			lastIndex = index;
		}
	});

	describe("Basic information Card", () => {
		it("renders every field from the spec's field list", () => {
			const html = stripSsrComments(
				cardHtml(
					renderWithI18n(
						<HazardousEventDetailPage
							data={makeDetail({
								recordOriginator: "originator",
								hazardousEventStatus: "ongoing",
								magnitude: "5.2",
								dataSource: "source",
								id: "event-xyz",
							})}
						/>,
					),
					hazardousEvents.detail.sections.basic_information,
					hazardousEvents.detail.sections.hazard_details,
				),
			);

			expect(html).toMatch(/>Record originator<\/p><p[^>]*>originator<\/p>/);
			expect(html).toMatch(/>Hazardous event Status<\/p>[^]*?>Ongoing<\/span>/);
			expect(html).toContain(">Record status</p>");
			expect(html).toMatch(/>Magnitude<\/p><p[^>]*>5\.2<\/p>/);
			expect(html).toMatch(/>Data source<\/p><p[^>]*>source<\/p>/);
			expect(html).toMatch(/>UUID<\/p><p[^>]*>event-xyz<\/p>/);
			expect(html).toMatch(/>Created at<\/p><p[^>]*>2026-01-01<\/p>/);
			expect(html).toMatch(/>Updated at<\/p><p[^>]*>2026-01-02<\/p>/);
		});

		// design.md Decision 13, Fix 2: legacy's literal Tailwind grid class, not the tighter mg-grid class.
		it("wraps its fields in legacy's 2-column grid class", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage data={makeDetail()} />,
			);

			expect(html).toMatch(
				/<div class="grid grid-cols-1 gap-6 md:grid-cols-2">/,
			);
			expect(html).not.toContain("mg-grid mg-grid__col-2");
		});

		it("renders a dash for every empty string field", () => {
			const html = stripSsrComments(
				cardHtml(
					renderWithI18n(
						<HazardousEventDetailPage
							data={makeDetail({
								recordOriginator: "",
								magnitude: "",
								dataSource: "",
							})}
						/>,
					),
					hazardousEvents.detail.sections.basic_information,
					hazardousEvents.detail.sections.hazard_details,
				),
			);

			expect(html).toMatch(/>Record originator<\/p><p[^>]*>-<\/p>/);
			expect(html).toMatch(/>Magnitude<\/p><p[^>]*>-<\/p>/);
			expect(html).toMatch(/>Data source<\/p><p[^>]*>-<\/p>/);
		});

		it("renders a dash for a null hazardousEventStatus", () => {
			const html = stripSsrComments(
				cardHtml(
					renderWithI18n(
						<HazardousEventDetailPage
							data={makeDetail({ hazardousEventStatus: null })}
						/>,
					),
					hazardousEvents.detail.sections.basic_information,
					hazardousEvents.detail.sections.hazard_details,
				),
			);

			expect(html).toMatch(/>Hazardous event Status<\/p><p[^>]*>—<\/p>/);
		});

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

		// Legacy colors this pill amber/emerald/blue (ongoing/passed/other), distinct from the Record status pill above.
		it.each([
			["ongoing", "bg-amber-100"],
			["passed", "bg-emerald-100"],
			["forecasted", "bg-blue-100"],
		] as const)(
			"renders the hazardousEventStatus pill for %s with its legacy color class",
			(value, colorClass) => {
				const html = renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({ hazardousEventStatus: value })}
					/>,
				);

				expect(html).toMatch(new RegExp(`class="[^"]*${colorClass}[^"]*"`));
			},
		);

		it("renders a distinct indicator and label for a null workflowStatus (DEF-031)", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({ workflowStatus: null })}
				/>,
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

		// Gate 9 finding: legacy renders every date field via formatDate's raw ISO output, not a human display format.
		it("renders Created at/Updated at in raw ISO (YYYY-MM-DD) format", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({
						createdAt: "2025-06-01T00:00:00.000Z",
						updatedAt: "2025-06-02T00:00:00.000Z",
					})}
				/>,
			);

			expect(html).toContain("2025-06-01");
			expect(html).toContain("2025-06-02");
			expect(html).not.toContain("1 Jun 2025");
		});

		// design.md Decision 13, Fix 1: legacy renders a PrimeIcon in every Card header.
		it("renders the pi-info-circle header icon (design.md Decision 13)", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage data={makeDetail()} />,
			);

			expect(html).toMatch(
				/<i class="pi pi-info-circle text-blue-600"[^>]*><\/i><h2[^>]*>Basic information<\/h2>/,
			);
		});

		// design.md Decision 15, Fix 1: legacy's tighter title-size group, not dts-heading-5.
		it("renders its title at legacy's tighter size (design.md Decision 15)", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage data={makeDetail()} />,
			);

			expect(html).toMatch(
				/<h2[^>]*class="text-\[16px\] leading-\[16px\] font-semibold"[^>]*>Basic information<\/h2>/,
			);
			expect(html).not.toMatch(/dts-heading-5[^"]*"[^>]*>Basic information/);
		});

		// Keeps the other seven fields in legacy's exact grid cells (design.md Decision 15, Fix 3).
		it("renders Record status after Updated at, not between Hazardous event status and Magnitude (design.md Decision 15)", () => {
			const html = stripSsrComments(
				cardHtml(
					renderWithI18n(<HazardousEventDetailPage data={makeDetail()} />),
					hazardousEvents.detail.sections.basic_information,
					hazardousEvents.detail.sections.hazard_details,
				),
			);

			const recordStatusIndex = html.indexOf(">Record status</p>");
			const updatedAtIndex = html.indexOf(">Updated at</p>");
			expect(recordStatusIndex).toBeGreaterThan(-1);
			expect(updatedAtIndex).toBeGreaterThan(-1);
			expect(recordStatusIndex).toBeGreaterThan(updatedAtIndex);
		});
	});

	describe("Hazard details Card", () => {
		it("renders all three resolved taxonomy levels", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							hazardTypeName: "Biological",
							hazardClusterName: "Infectious disease",
							specificHazardName: "Cholera",
						})}
					/>,
				),
				hazardousEvents.detail.sections.hazard_details,
				hazardousEvents.detail.sections.location,
			);

			expect(html).toContain("Biological");
			expect(html).toContain("Infectious disease");
			expect(html).toContain("Cholera");
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

			expect(html).toMatch(
				/<span[^>]*font-family:monospace[^>]*>raw-id<\/span>/,
			);
		});

		it("appends the resolved specificHazardCode to a resolved hazard name as 'name (code)'", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							specificHazardLocalName: null,
							specificHazardNationalName: null,
							specificHazardName: "Thunderstorm",
							specificHazardCode: "MH0103",
						})}
					/>,
				),
				hazardousEvents.detail.sections.hazard_details,
				hazardousEvents.detail.sections.location,
			);

			expect(html).toContain("Thunderstorm (MH0103)");
		});

		it.each([null, ""])(
			"renders the hazard name alone, with no parentheses, when specificHazardCode is %p",
			(specificHazardCode) => {
				const html = cardHtml(
					renderWithI18n(
						<HazardousEventDetailPage
							data={makeDetail({
								specificHazardLocalName: null,
								specificHazardNationalName: null,
								specificHazardName: "Thunderstorm",
								specificHazardCode,
							})}
						/>,
					),
					hazardousEvents.detail.sections.hazard_details,
					hazardousEvents.detail.sections.location,
				);

				expect(html).toMatch(/>Specific hazard<\/p><p[^>]*>Thunderstorm<\/p>/);
			},
		);

		it("never appends a code to the raw-id fallback, even when specificHazardCode is non-empty", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							specificHazardLocalName: null,
							specificHazardNationalName: null,
							specificHazardName: null,
							specificHazardId: "raw-id",
							specificHazardCode: "MH0103",
						})}
					/>,
				),
				hazardousEvents.detail.sections.hazard_details,
				hazardousEvents.detail.sections.location,
			);

			expect(html).toContain("raw-id");
			expect(html).not.toContain("MH0103");
		});

		// Exact div boundary, not a lazy match, so this tells Decision 14's 3-field grid apart from the old, buggy 2-field structure.
		it("wraps Hazard type, Hazard cluster, and Specific hazard in legacy's 2-column grid class", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage data={makeDetail()} />,
			);

			expect(html).toMatch(
				/Hazard cluster<\/p><p[^>]*>[^<]*<\/p><\/div><div class="space-y-1"><p[^>]*>Specific hazard/,
			);
			const specificHazardMatch = html.match(
				/<p[^>]*>Specific hazard<\/p>[\s\S]*?<\/div><\/div>/,
			);
			expect(specificHazardMatch).not.toBeNull();
			const gridCloseIndex = specificHazardMatch
				? html.indexOf(specificHazardMatch[0]) + specificHazardMatch[0].length
				: -1;
			const startDateGridIndex = html.indexOf(
				'<div class="grid grid-cols-1 gap-6 md:grid-cols-2"><div class="space-y-1"><p',
				gridCloseIndex,
			);
			expect(html.slice(gridCloseIndex, startDateGridIndex).trim()).toBe("");
		});

		it("wraps Start date and End date in legacy's 2-column grid class", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage data={makeDetail()} />,
			);

			const rowMatch = html.match(
				/<div class="grid grid-cols-1 gap-6 md:grid-cols-2"><div class="space-y-1"><p[^>]*>Start date<\/p>[\s\S]*?<\/div><div class="space-y-1"><p[^>]*>End date<\/p>[\s\S]*?<\/div><\/div>/,
			);
			expect(rowMatch).not.toBeNull();
		});

		// design.md Decision 13, Fix 1: legacy reuses pi-map-marker for this Card's header too.
		it("renders the pi-map-marker header icon (design.md Decision 13)", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage data={makeDetail()} />,
			);

			expect(html).toMatch(
				/<i class="pi pi-map-marker text-blue-600"[^>]*><\/i><h2[^>]*>Hazard details<\/h2>/,
			);
		});

		// design.md Decision 15, Fix 1: same tighter title-size group as Basic information.
		it("renders its title at legacy's tighter size (design.md Decision 15)", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage data={makeDetail()} />,
			);

			expect(html).toMatch(
				/<h2[^>]*class="text-\[16px\] leading-\[16px\] font-semibold"[^>]*>Hazard details<\/h2>/,
			);
		});

		it("renders dates in raw ISO (YYYY-MM-DD) format", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({ startDate: "2025-07-01T00:00:00.000Z" })}
				/>,
			);

			expect(html).toContain("2025-07-01");
			expect(html).not.toContain("1 Jul 2025");
		});

		// This page dashes empty fields rather than omitting them (spec: "SHALL NOT drop any field").
		it("renders a dash for every empty string field", () => {
			const html = stripSsrComments(
				cardHtml(
					renderWithI18n(
						<HazardousEventDetailPage
							data={makeDetail({
								nationalSpecification: "",
								description: "",
								chainsExplanation: "",
								endDate: "",
							})}
						/>,
					),
					hazardousEvents.detail.sections.hazard_details,
					hazardousEvents.detail.sections.location,
				),
			);

			expect(html).toMatch(/>National specification<\/p><p[^>]*>-<\/p>/);
			expect(html).toMatch(/>Description<\/p><p[^>]*>-<\/p>/);
			expect(html).toMatch(
				/>Composite event - chains explanation<\/p><p[^>]*>-<\/p>/,
			);
			expect(html).toMatch(/>End date<\/p><p[^>]*>-<\/p>/);
		});

		// Legacy preserves embedded newlines with a lighter, non-bold style for these three fields only (design.md Decision 10, Fix 4).
		it("preserves embedded line breaks and legacy's lighter styling for National specification, Description, and Chains explanation only", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage data={makeDetail()} />,
			);

			expect(html).toMatch(
				/>National specification<\/p><p class="[^"]*whitespace-pre-line[^"]*"/,
			);
			expect(html).toMatch(
				/>Description<\/p><p class="[^"]*whitespace-pre-line[^"]*"/,
			);
			expect(html).toMatch(
				/>Composite event - chains explanation<\/p><p class="[^"]*whitespace-pre-line[^"]*"/,
			);
			expect(html).toMatch(
				/>Record originator<\/p><p class="(?:(?!whitespace-pre-line).)*"/,
			);
		});

		// Local to this Card, matching legacy's Group A space-y-6 (design.md Decision 14).
		it("wraps this Card's own content in a space-y-6 div", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							nationalSpecification: "spec",
							description: "desc",
							chainsExplanation: "chains",
						})}
					/>,
				),
				hazardousEvents.detail.sections.hazard_details,
				hazardousEvents.detail.sections.location,
			);

			expect(html).toMatch(
				/<div class="space-y-6"><div class="grid grid-cols-1 gap-6 md:grid-cols-2">/,
			);
		});
	});

	describe("Location Card", () => {
		it("renders the empty state and no map container when there is no spatial observation", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({ currentSpatialObservation: null })}
					/>,
				),
				hazardousEvents.detail.sections.location,
				hazardousEvents.detail.sections.attachments,
			);

			expect(html).toContain(hazardousEvents.detail.spatial_observation.none);
			expect(html).not.toMatch(/aria-label="Spatial footprint map"/);
		});

		it("renders the observation's time/note and a map container when one is recorded", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							currentSpatialObservation: {
								id: "obs-1",
								hazardousEventId: "event-A",
								observationTime: "2026-02-01T00:00:00.000Z",
								note: "Flooded road",
								geometries: [{ type: "Point", coordinates: [0, 0] }],
								divisionIds: [],
								createdAt: "2026-02-01T00:00:00.000Z",
								updatedAt: "2026-02-01T00:00:00.000Z",
							},
						})}
					/>,
				),
				hazardousEvents.detail.sections.location,
				hazardousEvents.detail.sections.attachments,
			);

			expect(html).toContain("2026-02-01");
			expect(html).toContain("Flooded road");
			expect(html).toMatch(/aria-label="Spatial footprint map"/);
		});

		it("renders no map container when the observation has no geometries", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							currentSpatialObservation: {
								id: "obs-1",
								hazardousEventId: "event-A",
								observationTime: "2026-02-01T00:00:00.000Z",
								note: null,
								geometries: [],
								divisionIds: [],
								createdAt: "2026-02-01T00:00:00.000Z",
								updatedAt: "2026-02-01T00:00:00.000Z",
							},
						})}
					/>,
				),
				hazardousEvents.detail.sections.location,
				hazardousEvents.detail.sections.attachments,
			);

			expect(html).not.toMatch(/aria-label="Spatial footprint map"/);
		});

		// Populated branch only, matching legacy's Group B item-to-item gap (Decision 14).
		it("wraps the populated branch's Observation time, Note, and map in a space-y-5 div", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							currentSpatialObservation: {
								id: "obs-1",
								hazardousEventId: "event-A",
								observationTime: "2026-02-01T00:00:00.000Z",
								note: "Flooded road",
								geometries: [{ type: "Point", coordinates: [0, 0] }],
								divisionIds: [],
								createdAt: "2026-02-01T00:00:00.000Z",
								updatedAt: "2026-02-01T00:00:00.000Z",
							},
						})}
					/>,
				),
				hazardousEvents.detail.sections.location,
				hazardousEvents.detail.sections.attachments,
			);

			expect(html).toMatch(
				/<div class="space-y-5"><p><strong>Observation time/,
			);
		});

		it("renders the empty-state <p> with no space-y-5 wrapper", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({ currentSpatialObservation: null })}
					/>,
				),
				hazardousEvents.detail.sections.location,
				hazardousEvents.detail.sections.attachments,
			);

			expect(html).not.toContain("space-y-5");
		});

		// design.md Decision 13, Fix 1: legacy reuses pi-map-marker for this Card's header too.
		it("renders the pi-map-marker header icon (design.md Decision 13)", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage data={makeDetail()} />,
			);

			expect(html).toMatch(
				/<i class="pi pi-map-marker text-blue-600"[^>]*><\/i><h2[^>]*>Location<\/h2>/,
			);
		});
	});

	describe("Attachments Card", () => {
		it("renders the attachments section with each attachment's title when present", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({
						attachments: [
							{
								id: "attachment-1",
								title: "Site survey photo",
								type: "File",
								url: null,
								tag: null,
								fileKey: "key-1",
								fileName: "survey.jpg",
								fileType: "image/jpeg",
								fileSize: 100,
							},
						],
					})}
				/>,
			);

			expect(html).toContain("Site survey photo");
		});

		// Title can legally be "" (no NOT NULL/length check); dashed since this isRowHeader cell
		// would otherwise announce as nothing to assistive tech.
		it("renders '-' for an attachment with an empty-string title", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({
						attachments: [
							{
								id: "attachment-1",
								title: "",
								type: "Link",
								url: "https://example.com/report",
								tag: null,
								fileKey: null,
								fileName: null,
								fileType: null,
								fileSize: null,
							},
						],
					})}
				/>,
			);

			expect(html).toMatch(/role="rowheader"[^>]*>-<\/td>/);
		});

		// spec: "renders as a table, not a list" -- column headers present, no bare <ul>/<li> markup.
		it("renders the attachments section as a table with Title/Tags/File-URL column headers, not a bare list", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							attachments: [
								{
									id: "attachment-1",
									title: "Site survey photo",
									type: "File",
									url: null,
									tag: null,
									fileKey: "key-1",
									fileName: "survey.jpg",
									fileType: "image/jpeg",
									fileSize: 100,
								},
							],
						})}
					/>,
				),
				hazardousEvents.detail.sections.attachments,
				hazardousEvents.detail.sections.linked_events,
			);

			expect(html).toContain(
				hazardousEvents.detail.attachments_table.columns.title,
			);
			expect(html).toContain(
				hazardousEvents.detail.attachments_table.columns.tags,
			);
			expect(html).toContain(
				hazardousEvents.detail.attachments_table.columns.file_url,
			);
			// Scoped to this Card -- the Linked events Card legitimately renders a <ul> for effects.
			expect(html).not.toMatch(/<ul>/);
		});

		it("renders the attachments section's empty state when there are none", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage data={makeDetail({ attachments: [] })} />,
			);

			expect(html).toContain("No attachments");
		});

		// design.md Decision 14, Finding 4: each tag is its own styled pill, matching legacy.
		it("renders each tag as its own pill, not a single comma-joined text node", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({
						attachments: [
							{
								id: "attachment-1",
								title: "Site survey photo",
								type: "Link",
								url: "https://example.com/report",
								tag: [
									{ id: "tag-1", name: "Flood" },
									{ id: "tag-2", name: "Survey" },
								],
								fileKey: null,
								fileName: null,
								fileType: null,
								fileSize: null,
							},
						],
					})}
				/>,
			);

			expect(html).toMatch(
				/<span class="inline-flex items-center rounded-md bg-blue-50 px-2 py-0\.5 text-xs font-medium text-blue-700">Flood<\/span>/,
			);
			expect(html).toMatch(
				/<span class="inline-flex items-center rounded-md bg-blue-50 px-2 py-0\.5 text-xs font-medium text-blue-700">Survey<\/span>/,
			);
			expect(html).not.toContain("Flood, Survey");
		});

		it.each([null, []])(
			"renders '—' for an attachment's tag when it is %p, never legacy's 'N/A'",
			(tag) => {
				const html = renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							attachments: [
								{
									id: "attachment-1",
									title: "Site survey photo",
									type: "Link",
									url: "https://example.com/report",
									tag,
									fileKey: null,
									fileName: null,
									fileType: null,
									fileSize: null,
								},
							],
						})}
					/>,
				);

				expect(html).toMatch(/role="gridcell"[^>]*>—<\/td>/);
				expect(html).not.toContain("N/A");
			},
		);

		// Decision 9: href is built from fileKey (on-disk basename), display text from fileName.
		it("renders a File-type attachment as a link built from fileKey with fileName as its visible text", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({
						attachments: [
							{
								id: "attachment-1",
								title: "Site survey photo",
								type: "File",
								url: null,
								tag: null,
								fileKey: "uuid-123__survey.jpg",
								fileName: "survey.jpg",
								fileType: "image/jpeg",
								fileSize: 100,
							},
						],
					})}
				/>,
			);

			expect(html).toMatch(
				/<a[^>]*href="[^"]*name=event-A\/uuid-123__survey\.jpg[^"]*"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>/,
			);
			// Anchored on the text node, not the href -- the href also contains "survey.jpg".
			expect(html).toMatch(/<\/i>survey\.jpg</);
		});

		it("renders a Link-type attachment as a link to attachment.url, opening in a new tab safely", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({
						attachments: [
							{
								id: "attachment-1",
								title: "Site survey photo",
								type: "Link",
								url: "https://example.com/report",
								tag: null,
								fileKey: null,
								fileName: null,
								fileType: null,
								fileSize: null,
							},
						],
					})}
				/>,
			);

			expect(html).toMatch(
				/<a[^>]*href="https:\/\/example\.com\/report"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>/,
			);
		});

		// design.md Decision 14, Finding 5. Legacy has no leading icon on a Link-type attachment.
		it("renders a trailing external-link icon, and no leading file icon, for a Link-type attachment", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({
						attachments: [
							{
								id: "attachment-1",
								title: "Site survey photo",
								type: "Link",
								url: "https://example.com/report",
								tag: null,
								fileKey: null,
								fileName: null,
								fileType: null,
								fileSize: null,
							},
						],
					})}
				/>,
			);

			expect(html).toMatch(/<i class="pi pi-external-link[^"]*"[^>]*><\/i>/);
			expect(html).not.toMatch(/<i class="pi pi-file[^"]*"[^>]*><\/i>/);
		});

		it("renders a leading type icon and trailing size suffix for a File-type attachment with a known positive fileSize", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({
						attachments: [
							{
								id: "attachment-1",
								title: "Site survey photo",
								type: "File",
								url: null,
								tag: null,
								fileKey: "uuid-123__survey.jpg",
								fileName: "survey.jpg",
								fileType: "image/jpeg",
								fileSize: 2048,
							},
						],
					})}
				/>,
			);

			expect(html).toMatch(/<i class="pi pi-image[^"]*"[^>]*><\/i>/);
			expect(html).toContain("2.0 KB");
		});

		// CA's fileSize is number | null, unlike legacy's plain number -- no "0 B" fallback.
		it("renders the leading type icon but no size suffix for a File-type attachment with fileSize: null", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({
						attachments: [
							{
								id: "attachment-1",
								title: "Site survey photo",
								type: "File",
								url: null,
								tag: null,
								fileKey: "uuid-123__survey.jpg",
								fileName: "survey.jpg",
								fileType: "image/jpeg",
								fileSize: null,
							},
						],
					})}
				/>,
			);

			expect(html).toMatch(/<i class="pi pi-image[^"]*"[^>]*><\/i>/);
			expect(html).not.toContain("B)");
		});

		// design.md Decision 13, Fix 1.
		it("renders the pi-paperclip header icon (design.md Decision 13)", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage data={makeDetail()} />,
			);

			expect(html).toMatch(
				/<i class="pi pi-paperclip text-blue-600"[^>]*><\/i><h2[^>]*>Attachments<\/h2>/,
			);
		});

		// design.md Decision 15, Fix 5: legacy's link color/weight/hover, both attachment types.
		it("renders both Link-type and File-type attachment anchors with legacy's link styling", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({
						attachments: [
							{
								id: "attachment-link",
								title: "Report",
								type: "Link",
								url: "https://example.com/report",
								tag: null,
								fileKey: null,
								fileName: null,
								fileType: null,
								fileSize: null,
							},
							{
								id: "attachment-file",
								title: "Survey photo",
								type: "File",
								url: null,
								tag: null,
								fileKey: "uuid-123__survey.jpg",
								fileName: "survey.jpg",
								fileType: "image/jpeg",
								fileSize: 100,
							},
						],
					})}
				/>,
			);

			const anchors = html.match(/<a[^>]*>/g) ?? [];
			const attachmentAnchors = anchors.filter((a) =>
				a.includes('target="_blank"'),
			);
			expect(attachmentAnchors.length).toBe(2);
			for (const anchor of attachmentAnchors) {
				expect(anchor).toContain("text-sm");
				expect(anchor).toContain("font-medium");
				expect(anchor).toContain("text-blue-700");
				expect(anchor).toContain("hover:text-blue-800");
				expect(anchor).toContain("hover:underline");
			}
		});

		// design.md Decision 15, Fix 7: shared "cozy" padding, same mechanism as the Audit log table.
		it("renders every column/cell with cozy padding, not the compact token style", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({
						attachments: [
							{
								id: "attachment-1",
								title: "Site survey photo",
								type: "File",
								url: null,
								tag: null,
								fileKey: "key-1",
								fileName: "survey.jpg",
								fileType: "image/jpeg",
								fileSize: 100,
							},
						],
					})}
				/>,
			);

			expect(html).toMatch(/<th[^>]*style="[^"]*padding:0\.5rem 0\.75rem/);
			expect(html).toMatch(/<td[^>]*style="[^"]*padding:0\.5rem 0\.75rem/);
			expect(html).not.toContain(
				'style="border-bottom:1px solid var(--color-dts-table-border);padding:var(--spacing-dts-cell-padding);height:auto"',
			);
		});
	});

	describe("Linked events Card", () => {
		it("renders a 'No cause recorded' empty state when cause is null", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage data={makeDetail({ cause: null })} />,
				),
				hazardousEvents.detail.sections.linked_events,
				hazardousEvents.detail.sections.audit_log_history,
			);

			expect(html).toContain(hazardousEvents.detail.linked_events.no_cause);
		});

		it("renders a link to the cause event's own detail page when cause is resolved, inside a bordered card", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							cause: {
								id: "cause-event-1",
								displayName: "Heavy rainfall",
								causalityExplanation: "Triggered flooding",
								specificHazardCode: "MH0103",
								description: "Heavy rainfall description",
							},
						})}
					/>,
				),
				hazardousEvents.detail.sections.linked_events,
				hazardousEvents.detail.sections.audit_log_history,
			);

			expect(html).toMatch(/<a[^>]*href="\/en\/he-preview\/cause-event-1"/);
			expect(html).toContain("Heavy rainfall");
			expect(html).toContain("Triggered flooding");
			expect(html).toMatch(/class="[^"]*rounded-xl[^"]*border[^"]*"/);
		});

		// design.md Decision 14, Finding 6: legacy's title is a bold blue link, not plain-weight.
		it("renders the title link with legacy's bold blue classes", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							cause: {
								id: "cause-event-1",
								displayName: "Heavy rainfall",
								causalityExplanation: null,
								specificHazardCode: null,
								description: "",
							},
						})}
					/>,
				),
				hazardousEvents.detail.sections.linked_events,
				hazardousEvents.detail.sections.audit_log_history,
			);

			const titleTag = html.match(
				/<a[^>]*href="\/en\/he-preview\/cause-event-1"[^>]*>/,
			)?.[0];
			expect(titleTag).toContain("font-semibold");
			expect(titleTag).toContain("text-blue-700");
			expect(html).toMatch(/>Heavy rainfall<\/a>/);
		});

		// design.md Decision 14, Finding 6: HIP code and short id in the subtitle, below the title.
		it("renders the composed subtitle with the HIP code and short id, and causalityExplanation on its own line, not folded into the subtitle", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							cause: {
								id: "cause-event-123",
								displayName: "Heavy rainfall",
								causalityExplanation: "Triggered flooding",
								specificHazardCode: "MH0103",
								description: "Heavy rainfall description",
							},
						})}
					/>,
				),
				hazardousEvents.detail.sections.linked_events,
				hazardousEvents.detail.sections.audit_log_history,
			);

			expect(html).toContain("HIP: MH0103");
			expect(html).toContain("UUID: cause-ev");
			expect(html).toMatch(
				/HIP: MH0103 • Heavy rainfall description • UUID: cause-ev/,
			);
			expect(html).not.toMatch(/HIP: MH0103[^<]*Triggered flooding/);
			const subtitleIndex = html.indexOf("UUID: cause-ev");
			const explanationIndex = html.indexOf("Triggered flooding");
			expect(explanationIndex).toBeGreaterThan(subtitleIndex);
		});

		// design.md Decision 14, Finding 6: title fallback chain when displayName is empty.
		it("renders the description as the title when displayName is empty", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							cause: {
								id: "cause-event-1",
								displayName: "",
								causalityExplanation: null,
								specificHazardCode: null,
								description: "Unresolved hazard description",
							},
						})}
					/>,
				),
				hazardousEvents.detail.sections.linked_events,
				hazardousEvents.detail.sections.audit_log_history,
			);

			expect(html).toContain("Unresolved hazard description");
		});

		it("renders a 'No effects recorded' empty state when effects is empty", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage data={makeDetail({ effects: [] })} />,
				),
				hazardousEvents.detail.sections.linked_events,
				hazardousEvents.detail.sections.audit_log_history,
			);

			expect(html).toContain(hazardousEvents.detail.linked_events.no_effects);
		});

		it("renders one link per resolved effect, each to its own detail page, each inside a bordered card", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							effects: [
								{
									id: "effect-1",
									displayName: "Landslide",
									causalityExplanation: null,
									specificHazardCode: "MH0104",
									description: "Landslide description",
								},
								{
									id: "effect-2",
									displayName: "Road closure",
									causalityExplanation: "Blocked access",
									specificHazardCode: null,
									description: "Road closure description",
								},
							],
						})}
					/>,
				),
				hazardousEvents.detail.sections.linked_events,
				hazardousEvents.detail.sections.audit_log_history,
			);

			expect(html).toMatch(/<a[^>]*href="\/en\/he-preview\/effect-1"/);
			expect(html).toContain("Landslide");
			expect(html).toMatch(/<a[^>]*href="\/en\/he-preview\/effect-2"/);
			expect(html).toContain("Road closure");
			expect(html).toContain("Blocked access");
			expect(
				html.match(/rounded-xl[^"]*border/g)?.length,
			).toBeGreaterThanOrEqual(2);
		});

		// Each group ties its own label/content (space-y-2); gap between groups is wider (space-y-4).
		it("wraps 'Caused by' and 'Causing' as two tightly-grouped sections with a wider gap between them", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							cause: {
								id: "cause-event-1",
								displayName: "Heavy rainfall",
								causalityExplanation: null,
								specificHazardCode: null,
								description: "",
							},
							effects: [],
						})}
					/>,
				),
				hazardousEvents.detail.sections.linked_events,
				hazardousEvents.detail.sections.audit_log_history,
			);

			expect(html).toMatch(
				/<div class="space-y-4"><div class="space-y-2">[\s\S]*?Caused by[\s\S]*?<\/div><div class="space-y-2">[\s\S]*?Causing[\s\S]*?<\/div><\/div>/,
			);
		});

		// design.md Decision 15, Fix 4: legacy's exact label markup, no colon, no <strong>.
		it("renders the 'Caused by' and 'Causing' labels with legacy's exact styling and no trailing colon", () => {
			const html = cardHtml(
				renderWithI18n(<HazardousEventDetailPage data={makeDetail()} />),
				hazardousEvents.detail.sections.linked_events,
				hazardousEvents.detail.sections.audit_log_history,
			);

			expect(html).toMatch(
				/<p class="text-\[13px\] font-semibold text-slate-700">Caused by<\/p>/,
			);
			expect(html).toMatch(
				/<p class="text-\[13px\] font-semibold text-slate-700">Causing<\/p>/,
			);
			expect(html).not.toMatch(/<strong>Caused by:?<\/strong>/);
			expect(html).not.toMatch(/<strong>Causing:?<\/strong>/);
		});

		// design.md Decision 13, Fix 1.
		it("renders the pi-link header icon (design.md Decision 13)", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage data={makeDetail()} />,
			);

			expect(html).toMatch(
				/<i class="pi pi-link text-blue-600"[^>]*><\/i><h2[^>]*>Linked events<\/h2>/,
			);
		});
	});

	describe("Audit log history Card", () => {
		it("renders the empty-state message, not an empty table, when there is no audit history", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage data={makeDetail({ auditLog: [] })} />,
				),
				hazardousEvents.detail.sections.audit_log_history,
			);

			expect(html).toContain(hazardousEvents.detail.audit_log.empty);
			expect(html).not.toContain("<table");
		});

		it("renders a 5-column table from auditLog, passing actorName through as 'by' and no organization", () => {
			const timestamp = "2026-11-12T16:31:40.000Z";
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							auditLog: [
								{
									id: "log-1",
									action: "Submit draft",
									actorName: "Test",
									timestamp,
								},
							],
						})}
					/>,
				),
				hazardousEvents.detail.sections.audit_log_history,
			);

			expect(html).toContain("Action taken");
			expect(html).toContain("By");
			expect(html).toContain("Organisation");
			expect(html).toContain("Date");
			expect(html).toContain("Time");
			expect(html).toContain("Submit draft");
			expect(html).toContain("Test");
			expect(html).toContain(new Date(timestamp).toDateString());
			expect(html).toContain(new Date(timestamp).toTimeString());
		});

		// design.md Decision 15, Fix 8: proves the new table calls translateAuditLogAction, not a raw pass-through.
		it("renders a Create/Update/Delete-object action translated via t(), not the raw English string", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							auditLog: [
								{
									id: "log-1",
									action: "Create hazardous event",
									actorName: "Test",
									timestamp: "2026-11-12T16:31:40.000Z",
								},
							],
						})}
					/>,
				),
				hazardousEvents.detail.sections.audit_log_history,
			);

			expect(html).toContain("CREATED: HE");
			expect(html).not.toContain("Create hazardous event");
		});

		it("renders a humanized action string unchanged (already humanized upstream by GetHazardousEventById)", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							auditLog: [
								{
									id: "log-1",
									action: "Submit draft",
									actorName: "Test",
									timestamp: "2026-11-12T16:31:40.000Z",
								},
							],
						})}
					/>,
				),
				hazardousEvents.detail.sections.audit_log_history,
			);

			expect(html).toContain("Submit draft");
		});

		it("renders newest-first order, unchanged from the resolved auditLog array order", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							auditLog: [
								{
									id: "log-2",
									action: "Newer action",
									actorName: "Test",
									timestamp: "2026-11-12T16:31:40.000Z",
								},
								{
									id: "log-1",
									action: "Older action",
									actorName: "Test",
									timestamp: "2026-11-12T16:00:55.000Z",
								},
							],
						})}
					/>,
				),
				hazardousEvents.detail.sections.audit_log_history,
			);

			const newerIndex = html.indexOf("Newer action");
			const olderIndex = html.indexOf("Older action");
			expect(newerIndex).toBeGreaterThan(-1);
			expect(olderIndex).toBeGreaterThan(newerIndex);
		});

		// design.md Decision 13, Fix 1.
		it("renders the pi-history header icon (design.md Decision 13)", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage data={makeDetail()} />,
			);

			expect(html).toMatch(
				/<i class="pi pi-history text-blue-600"[^>]*><\/i><h2[^>]*>Audit log history<\/h2>/,
			);
		});

		// design.md Decision 15, Fix 8: same padding mechanism as the Attachments table (Fix 7).
		it("renders every column/cell with cozy padding, with Action taken as the row header", () => {
			const html = cardHtml(
				renderWithI18n(
					<HazardousEventDetailPage
						data={makeDetail({
							auditLog: [
								{
									id: "log-1",
									action: "Submit draft",
									actorName: "Test",
									timestamp: "2026-11-12T16:31:40.000Z",
								},
							],
						})}
					/>,
				),
				hazardousEvents.detail.sections.audit_log_history,
			);

			expect(html).toMatch(/<th[^>]*style="[^"]*padding:0\.5rem 0\.75rem/);
			expect(html).toMatch(/<td[^>]*style="[^"]*padding:0\.5rem 0\.75rem/);
			expect(html).toMatch(/role="rowheader"[^>]*>Submit draft<\/td>/);
		});
	});

	// design.md Decision 11: legacy's real detail page has neither link (hideEditButton={true}); both removed here to match.
	describe("Edit link and add-cause link removal (design.md Decision 11)", () => {
		it("renders neither the Edit link nor the add-cause link, but still renders the back link", () => {
			const html = renderWithI18n(
				<HazardousEventDetailPage
					data={makeDetail({ id: "event-A", workflowStatus: "DRAFT" })}
				/>,
			);

			expect(html).not.toMatch(/he-preview\/edit\/event-A/);
			expect(html).not.toMatch(/he-preview\/new\?parent=event-A/);
			expect(html).toMatch(/<a[^>]*href="\/en\/he-preview"[^>]*>/);
			expect(html).toContain(hazardousEvents.detail.back_to_list);
			const linkMatch = html.match(/<a[^>]*href="\/en\/he-preview"[^>]*>/);
			expect(linkMatch?.[0]).toContain("border-blue-500");
		});
	});
});
