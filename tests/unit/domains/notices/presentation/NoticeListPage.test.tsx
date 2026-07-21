import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import { TranslationGetter } from "~/utils/translator";
import type { NoticeDto } from "~/domains/notices/application/dto/NoticeDto";

// Satisfies useViewContext()'s unconditional .t build (kept only for .lang here) — not testing translation.
const stubTranslationGetter: TranslationGetter = (params) => ({
	msg: params.msg ?? params.code,
});
vi.stubGlobal(
	"createTranslationGetter",
	(_lang: string) => stubTranslationGetter,
);

vi.mock("react-router", () => ({
	useRouteLoaderData: vi.fn(() => ({ common: { lang: "en", user: null } })),
	Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
		React.createElement("a", { href: to }, children),
}));

import { NoticeListPage } from "~/domains/notices/presentation/NoticeListPage";

// Inline mirror of locales/en/{notices,common}.json (design.md Decision 5 — no file import).
const notices = {
	list: {
		empty: "No notices found.",
		columns: {
			title: "Title",
			status: "Status",
			published_at: "Published",
			updated_at: "Last updated",
			actions: "Actions",
		},
	},
	status: { published: "Published", draft: "Draft" },
	title: "Notices",
};
const common = { view: "View" };

// French status keys only — old ctx.t() ignores language, so this proves real i18next resolution.
const noticesFr = { status: { published: "Publié", draft: "Brouillon" } };

let testI18n: I18n;

beforeAll(async () => {
	testI18n = i18n.createInstance();
	await testI18n.use(initReactI18next).init({
		lng: "en",
		fallbackLng: "en",
		ns: ["notices", "common"],
		defaultNS: "notices",
		resources: {
			en: { notices, common },
			fr: { notices: noticesFr, common },
		},
	});
});

function renderWithI18n(ui: React.ReactElement): string {
	return renderToString(
		<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>,
	);
}

function makeNotice(overrides: Partial<NoticeDto> = {}): NoticeDto {
	return {
		id: crypto.randomUUID(),
		tenantId: "tenant-1",
		titleJson: { en: "Untitled" },
		bodyJson: null,
		isPublished: true,
		publishedAt: "2026-01-01T00:00:00.000Z",
		audience: "all",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("NoticeListPage", () => {
	it("renders one row per notice with the resolved title", () => {
		const noticeList = [
			makeNotice({ titleJson: { en: "Notice A" } }),
			makeNotice({ titleJson: { en: "Notice B" } }),
			makeNotice({ titleJson: { en: "Notice C" } }),
		];

		const html = renderWithI18n(<NoticeListPage data={noticeList} />);

		expect(html).toContain("Notice A");
		expect(html).toContain("Notice B");
		expect(html).toContain("Notice C");
	});

	it("renders the empty-state message when there are no notices", () => {
		const html = renderWithI18n(<NoticeListPage data={[]} />);

		expect(html).toContain(notices.list.empty);
	});

	it("renders all five translated column headers", () => {
		const html = renderWithI18n(<NoticeListPage data={[makeNotice()]} />);

		expect(html).toContain(notices.list.columns.title);
		expect(html).toContain(notices.list.columns.status);
		expect(html).toContain(notices.list.columns.published_at);
		expect(html).toContain(notices.list.columns.updated_at);
		expect(html).toContain(notices.list.columns.actions);
	});

	it("renders distinct Published/Draft status labels", () => {
		const noticeList = [
			makeNotice({ titleJson: { en: "Published notice" }, isPublished: true }),
			makeNotice({ titleJson: { en: "Draft notice" }, isPublished: false }),
		];

		const html = renderWithI18n(<NoticeListPage data={noticeList} />);

		expect(html).toContain(notices.status.published);
		expect(html).toContain(notices.status.draft);
	});

	it("renders the row action's accessible label from the shared common namespace", () => {
		const html = renderWithI18n(<NoticeListPage data={[makeNotice()]} />);

		expect(html).toContain(`aria-label="${common.view}"`);
	});

	it("renders the French status label when the i18n instance's language is fr", async () => {
		await testI18n.changeLanguage("fr");
		const html = renderWithI18n(
			<NoticeListPage data={[makeNotice({ isPublished: true })]} />,
		);
		await testI18n.changeLanguage("en");

		expect(html).toContain(`>${noticesFr.status.published}<`);
	});
});
