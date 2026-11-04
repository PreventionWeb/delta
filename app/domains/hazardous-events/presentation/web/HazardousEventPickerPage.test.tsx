import { describe, it, expect, vi, beforeAll } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import { TranslationGetter } from "~/utils/translator";
import type { HazardousEventListPageData } from "~/domains/hazardous-events/presentation/web/HazardousEventListPage";
import type { HazardousEventListItemDto } from "~/domains/hazardous-events/application/dto/HazardousEventListItemDto";

// Satisfies useViewContext()'s unconditional .t build -- same harness as
// HazardousEventListPage.test.tsx.
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

import { HazardousEventPickerPage } from "~/domains/hazardous-events/presentation/web/HazardousEventPickerPage";

const hazardousEvents = {
	title: "Hazardous events",
	list: {
		empty: "No hazardous events found.",
		showing_of_total: "Showing {{filtered}} of {{total}} hazardous event(s)",
		add_new_event: "Add new event",
		resource_actions: "Resource actions",
		count_in_instance: "{{count}} hazardous event(s) in {{instance}}",
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
	picker: { select: "Select" },
	pagination: {
		label: "Pagination",
		previous: "Previous page",
		next: "Next page",
		current_page: "Current page, page {{page_number}}",
		page_n: "Page {{page_number}}",
		items_per_page: "Items per page",
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

function renderAt(url: string, ui: React.ReactElement): string {
	return renderToString(
		<MemoryRouter initialEntries={[url]}>
			<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>
		</MemoryRouter>,
	);
}

function makeData(
	overrides: Partial<HazardousEventListPageData> = {},
): HazardousEventListPageData {
	return {
		items: [],
		totalCount: 0,
		unfilteredTotalCount: 0,
		taxonomyOptions: { types: [], clusters: [], specificHazards: [] },
		role: "admin",
		...overrides,
	};
}

// Negative-regression test (design.md Decision 15, 9a.2b): the parent-picker popup must never
// render either new list-page component, even for an admin session -- the picker's own EditData
// gate means every picker session would otherwise pass HazardousEventListActions' role check too.
describe("HazardousEventPickerPage never renders the new list-page components (design.md Decision 15)", () => {
	it("does not render the 'Add new event' link even when role is admin", () => {
		const html = renderAt(
			"/en/he-preview/picker",
			<HazardousEventPickerPage data={makeData({ role: "admin" })} />,
		);

		expect(html).not.toContain("/en/he-preview/new");
		expect(html).not.toContain("Add new event");
	});

	it("does not render the top-of-page unfiltered-total count header", () => {
		const html = renderAt(
			"/en/he-preview/picker",
			<HazardousEventPickerPage
				data={makeData({ unfilteredTotalCount: 42, role: "admin" })}
			/>,
		);

		expect(html).not.toContain("hazardous event(s) in");
	});

	// Regression guard (design.md Decision 23, task 9i.6): the picker always supplies its own
	// renderActionsCell override, so the default branch 9i.5 added an Edit link to is never
	// reached here -- even for an editable-status row under a role with EditData.
	it("renders only the Select action for a row, never the new Edit link, even for an editable-status admin row", () => {
		const item: HazardousEventListItemDto = {
			id: "picker-item",
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
			workflowStatus: "DRAFT",
		};

		const html = renderAt(
			"/en/he-preview/picker",
			<HazardousEventPickerPage
				data={makeData({ items: [item], role: "admin" })}
			/>,
		);

		expect(html).toContain("Select");
		expect(html).not.toContain('<use href="/assets/icons/edit.svg#edit">');
	});
});
