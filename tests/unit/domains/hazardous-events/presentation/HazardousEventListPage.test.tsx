import { describe, it, expect, vi, beforeAll } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import { TranslationGetter } from "~/utils/translator";
import type { HazardousEventListItemDto } from "~/domains/hazardous-events/application/dto/HazardousEventListItemDto";
import type { ListHazardousEventsResult } from "~/domains/hazardous-events/application/use-cases/ListHazardousEvents";

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

import { HazardousEventListPage } from "~/domains/hazardous-events/presentation/HazardousEventListPage";

// Inline mirror of locales/en/{hazardous-events,common}.json (Notices precedent — no file import).
const hazardousEvents = {
	title: "Hazardous events",
	list: {
		empty: "No hazardous events found.",
		showing_of_total: "Showing {{filtered}} of {{total}} hazardous event(s)",
		columns: {
			hazard: "Hazard type",
			record_status: "Record status",
			hazardous_event_uuid: "Hazardous event UUID",
			created_at: "Created",
			updated_at: "Updated",
			actions: "Actions",
		},
		page_size: "{{count}} / page",
	},
	status: {
		draft: "Draft",
		waiting_for_validation: "Waiting for validation",
		needs_revision: "Needs revision",
		validated: "Validated",
		rejected: "Rejected",
		published: "Published",
		missing: "Not yet determined",
	},
	pagination: {
		label: "Pagination",
		previous: "Previous page",
		next: "Next page",
		current_page: "Current page, page {{page_number}}",
		page_n: "Page {{page_number}}",
		items_per_page: "Items per page",
	},
};
const common = { view: "View" };

let testI18n: I18n;

beforeAll(async () => {
	testI18n = i18n.createInstance();
	await testI18n.use(initReactI18next).init({
		lng: "en",
		fallbackLng: "en",
		ns: ["hazardous-events", "common"],
		defaultNS: "hazardous-events",
		resources: { en: { "hazardous-events": hazardousEvents, common } },
	});
});

function renderAt(url: string, ui: React.ReactElement): string {
	return renderToString(
		<MemoryRouter initialEntries={[url]}>
			<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>
		</MemoryRouter>,
	);
}

function makeItem(
	overrides: Partial<HazardousEventListItemDto> = {},
): HazardousEventListItemDto {
	return {
		id: crypto.randomUUID(),
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
		...overrides,
	};
}

/** Defaults totalCount to items.length -- most tests don't care about a total distinct from the
 * page they seed; items 2-4's own tests override it explicitly. */
function makeResult(
	items: HazardousEventListItemDto[],
	totalCount = items.length,
): ListHazardousEventsResult {
	return { items, totalCount };
}

describe("HazardousEventListPage", () => {
	it("renders the empty-state message when there are no events", () => {
		const html = renderAt(
			"/en/he-preview",
			<HazardousEventListPage data={makeResult([])} />,
		);

		expect(html).toContain(hazardousEvents.list.empty);
	});

	it("renders a row action link targeting the event's own lang-prefixed detail route", () => {
		const item = makeItem({ id: "abc" });

		const html = renderAt(
			"/en/he-preview",
			<HazardousEventListPage data={makeResult([item])} />,
		);

		expect(html).toMatch(/<a[^>]*href="\/en\/he-preview\/abc"/);
	});

	it("falls back from specificHazardLocalName to specificHazardNationalName to specificHazardId", () => {
		const localItem = makeItem({ specificHazardLocalName: "Local hazard" });
		const nationalItem = makeItem({
			specificHazardLocalName: null,
			specificHazardNationalName: "National hazard",
		});
		const idOnlyItem = makeItem({
			specificHazardLocalName: null,
			specificHazardNationalName: null,
			specificHazardId: "raw-id",
		});

		const html = renderAt(
			"/en/he-preview",
			<HazardousEventListPage
				data={makeResult([localItem, nationalItem, idOnlyItem])}
			/>,
		);

		expect(html).toContain("Local hazard");
		expect(html).toContain("National hazard");
		expect(html).toContain("raw-id");
	});

	// Reversed scope decision (design.md): the resolved taxonomy name now ranks above the raw
	// id fallback, below the two user-override names.
	it("falls back to the resolved taxonomy name, not the raw id, when no override name is set", () => {
		const resolvedItem = makeItem({
			specificHazardLocalName: null,
			specificHazardNationalName: null,
			specificHazardName: "Drought",
			specificHazardId: "raw-id",
		});

		const html = renderAt(
			"/en/he-preview",
			<HazardousEventListPage data={makeResult([resolvedItem])} />,
		);

		expect(html).toContain("Drought");
		expect(html).not.toContain("raw-id");
	});

	// Gate 9 finding: design.md Decision 7 requires the raw-id fallback be "visually
	// distinguished so a UUID fallback is obvious" -- in the real dataset used for Gate 9
	// verification, every row fell back to the raw id, and with no distinguishing style it read
	// as ordinary content rather than an obvious fallback.
	it("renders the specificHazardId fallback in a visually distinct style, not plain text", () => {
		const localItem = makeItem({ specificHazardLocalName: "Local hazard" });
		const idOnlyItem = makeItem({
			specificHazardLocalName: null,
			specificHazardNationalName: null,
			specificHazardId: "raw-id",
		});

		const html = renderAt(
			"/en/he-preview",
			<HazardousEventListPage data={makeResult([localItem, idOnlyItem])} />,
		);

		expect(html).toMatch(/<span[^>]*font-family:monospace[^>]*>raw-id<\/span>/);
		expect(html).not.toMatch(
			/<span[^>]*font-family:monospace[^>]*>Local hazard<\/span>/,
		);
	});

	// Human-identified gap: the list page's columns are now legacy's own exact 5 (Hazard type,
	// Record status, Hazardous event UUID, Created, Updated) plus Actions -- only
	// hazardousEventStatus ("Event status") is dropped (workflowStatus stays, both here as
	// "Record status" and on the detail page -- DEF-031's payload).
	it("renders legacy's exact column headers, including Record status", () => {
		const html = renderAt(
			"/en/he-preview",
			<HazardousEventListPage data={makeResult([makeItem()])} />,
		);

		expect(html).toContain(hazardousEvents.list.columns.hazard);
		expect(html).toContain(hazardousEvents.list.columns.record_status);
		expect(html).toContain(hazardousEvents.list.columns.hazardous_event_uuid);
		expect(html).toContain(hazardousEvents.list.columns.created_at);
		expect(html).toContain(hazardousEvents.list.columns.updated_at);
		expect(html).toContain(hazardousEvents.list.columns.actions);
	});

	it("renders the event's own id truncated to 5 characters as a link to its detail page, matching legacy", () => {
		const item = makeItem({ id: "abcdefgh-1234-5678-9012-345678901234" });

		const html = renderAt(
			"/en/he-preview",
			<HazardousEventListPage data={makeResult([item])} />,
		);

		expect(html).toMatch(
			/<a[^>]*href="\/en\/he-preview\/abcdefgh[^"]*"[^>]*>abcde<\/a>/,
		);
	});

	it("renders a distinct indicator for a null workflowStatus in the Record status column", () => {
		const item = makeItem({ workflowStatus: null });

		const html = renderAt(
			"/en/he-preview",
			<HazardousEventListPage data={makeResult([item])} />,
		);

		expect(html).toContain("var(--color-dts-status-missing)");
		expect(html).toContain(hazardousEvents.status.missing);
	});

	it("renders the real workflow status label when not null", () => {
		const item = makeItem({ workflowStatus: "APPROVED" });

		const html = renderAt(
			"/en/he-preview",
			<HazardousEventListPage data={makeResult([item])} />,
		);

		expect(html).toContain(hazardousEvents.status.validated);
		expect(html).toMatch(/dts-status dts-status--validated/);
	});

	it("renders a view action as the legacy eye-icon affordance, not a text link (design.md Decision 7)", () => {
		const item = makeItem({ id: "abc" });

		const html = renderAt(
			"/en/he-preview",
			<HazardousEventListPage data={makeResult([item])} />,
		);

		expect(html).toMatch(
			/<a[^>]*class="mg-button mg-button-table"[^>]*href="\/en\/he-preview\/abc"/,
		);
		expect(html).toContain(
			'<use href="/assets/icons/eye-show-password.svg#eye-show">',
		);
	});

	it("formats createdAt/updatedAt as dd-MM-yyyy, matching the legacy list table's own format", () => {
		const item = makeItem({
			createdAt: "2026-03-05T00:00:00.000Z",
			updatedAt: "2026-04-09T00:00:00.000Z",
		});

		const html = renderAt(
			"/en/he-preview",
			<HazardousEventListPage data={makeResult([item])} />,
		);

		expect(html).toContain("05-03-2026");
		expect(html).toContain("09-04-2026");
	});

	// Human decision, 2026-10-27: real total-count query + the summary line it feeds, matching
	// legacy's own hazardeventlist.tsx exactly.
	it("renders the Showing X of Y summary line", () => {
		const html = renderAt(
			"/en/he-preview",
			<HazardousEventListPage
				data={makeResult([makeItem(), makeItem()], 25)}
			/>,
		);

		expect(html).toContain("Showing 2 of 25 hazardous event(s)");
	});

	// Human decision, 2026-10-27: reuse workflowStatusDisplay's own dot-color mapping, not a
	// rebuild -- matching legacy's own ListLegend.tsx exactly (no "missing"/DEF-031 entry, since
	// legacy has none).
	it("renders the record-status color legend with legacy's own five statuses", () => {
		const html = renderAt(
			"/en/he-preview",
			<HazardousEventListPage data={makeResult([makeItem()])} />,
		);

		expect(html).toMatch(/<div class="dts-legend">/);
		for (const [className, label] of [
			["dts-status--draft", hazardousEvents.status.draft],
			[
				"dts-status--waiting-for-validation",
				hazardousEvents.status.waiting_for_validation,
			],
			["dts-status--needs-revision", hazardousEvents.status.needs_revision],
			["dts-status--validated", hazardousEvents.status.validated],
			["dts-status--published", hazardousEvents.status.published],
		] as const) {
			expect(html).toContain(className);
			expect(html).toContain(label);
		}
		expect(html).not.toContain(hazardousEvents.status.missing);
	});

	describe("numbered pagination", () => {
		it("renders no previous-page link on page 1", () => {
			const html = renderAt(
				"/en/he-preview?page=1",
				<HazardousEventListPage data={makeResult([makeItem()], 1)} />,
			);

			expect(html).not.toContain(hazardousEvents.pagination.previous);
		});

		it("renders a previous-page link when page is greater than 1", () => {
			const html = renderAt(
				"/en/he-preview?page=2&pageSize=1",
				<HazardousEventListPage data={makeResult([makeItem()], 3)} />,
			);

			expect(html).toContain(hazardousEvents.pagination.previous);
		});

		it("renders a next-page link only when more pages remain beyond the current one", () => {
			const lastPageHtml = renderAt(
				"/en/he-preview?page=3&pageSize=1",
				<HazardousEventListPage data={makeResult([makeItem()], 3)} />,
			);
			const middlePageHtml = renderAt(
				"/en/he-preview?page=2&pageSize=1",
				<HazardousEventListPage data={makeResult([makeItem()], 3)} />,
			);

			expect(middlePageHtml).toContain(hazardousEvents.pagination.next);
			expect(lastPageHtml).not.toContain(hazardousEvents.pagination.next);
		});

		// Human decision, 2026-10-27: real numbered pages (1 2 3 ... n), matching legacy's own
		// pagination/view.tsx getPaginationWindow() exactly (delta=2, condenses with "...").
		it("renders every page number when the total is small enough to need no condensing", () => {
			// totalPages=4, page=1: legacy's own delta=2 window is [1,2,3,4] -- no "...".
			const html = renderAt(
				"/en/he-preview?page=1&pageSize=1",
				<HazardousEventListPage data={makeResult([makeItem()], 4)} />,
			);

			for (const pageNumber of [1, 2, 3, 4]) {
				expect(html).toMatch(new RegExp(`>${pageNumber}<`));
			}
			expect(html).not.toContain("...");
		});

		it("condenses with an ellipsis beyond the current page's own delta-2 window", () => {
			const html = renderAt(
				"/en/he-preview?page=1&pageSize=1",
				<HazardousEventListPage data={makeResult([makeItem()], 10)} />,
			);

			// page=1: window is [1, 2, 3, "...", 10] per legacy's own delta=2 algorithm.
			for (const pageNumber of [1, 2, 3, 10]) {
				expect(html).toMatch(new RegExp(`>${pageNumber}<`));
			}
			expect(html).toMatch(/>\s*\.\.\.\s*</);
		});

		it("marks the current page with aria-current, not as a link", () => {
			const html = renderAt(
				"/en/he-preview?page=2&pageSize=1",
				<HazardousEventListPage data={makeResult([makeItem()], 3)} />,
			);

			expect(html).toMatch(/<span[^>]*aria-current="true"[^>]*>2<\/span>/);
		});
	});

	// Human decision: a minimal, 6a-scoped page-size <select>, not blocked on 6h's shared Select.
	it("renders a page-size selector with legacy's own PAGE_SIZE_OPTIONS", () => {
		const html = renderAt(
			"/en/he-preview",
			<HazardousEventListPage data={makeResult([makeItem()])} />,
		);

		expect(html).toMatch(/<select[^>]*id="dts-pagination-page-size"/);
		for (const size of [10, 20, 30, 40, 50]) {
			expect(html).toMatch(new RegExp(`<option value="${size}"`));
		}
	});
});
