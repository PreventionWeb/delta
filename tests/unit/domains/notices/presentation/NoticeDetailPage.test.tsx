import { describe, it, expect, vi, beforeAll } from "vitest";
import type { ReactElement } from "react";
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
	useRouteLoaderData: vi.fn(() => ({
		common: { lang: "en", user: null },
	})),
}));

import { NoticeDetailPage } from "~/domains/notices/presentation/NoticeDetailPage";

// Inline mirror of locales/en/notices.json (design.md Decision 5 — no file import).
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

function renderWithI18n(ui: ReactElement): string {
	return renderToString(
		<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>,
	);
}

// ADR-008: title/body are plain strings in a single authored locale — no more locale-map,
// no per-request resolution helper.
function makeNotice(overrides: Partial<NoticeDto> = {}): NoticeDto {
	return {
		id: "notice-1",
		tenantId: "tenant-1",
		title: "Untitled",
		body: null,
		locale: "en",
		isPublished: true,
		publishedAt: "2026-01-01T00:00:00.000Z",
		audience: "all",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("NoticeDetailPage", () => {
	it("renders the notice's own title, whatever locale it was authored in", () => {
		const html = renderWithI18n(
			<NoticeDetailPage data={makeNotice({ title: "Titre", locale: "fr" })} />,
		);

		expect(html).toContain("Titre");
	});

	it("renders the notice's own body", () => {
		const html = renderWithI18n(
			<NoticeDetailPage
				data={makeNotice({ title: "Title", body: "Some body text" })}
			/>,
		);

		expect(html).toContain("Some body text");
	});

	it("renders an empty body when body is null", () => {
		const html = renderWithI18n(
			<NoticeDetailPage data={makeNotice({ title: "Title", body: null })} />,
		);

		expect(html).toContain("<div></div>");
	});

	it("renders the translated Published status label", () => {
		const html = renderWithI18n(
			<NoticeDetailPage
				data={makeNotice({ title: "Title", isPublished: true })}
			/>,
		);

		expect(html).toContain(notices.status.published);
	});

	it("renders the translated Draft status label", () => {
		const html = renderWithI18n(
			<NoticeDetailPage
				data={makeNotice({ title: "Title", isPublished: false })}
			/>,
		);

		expect(html).toContain(notices.status.draft);
	});

	it("renders the French status label when the i18n instance's language is fr", async () => {
		await testI18n.changeLanguage("fr");
		const html = renderWithI18n(
			<NoticeDetailPage
				data={makeNotice({ title: "Titre", isPublished: true })}
			/>,
		);
		await testI18n.changeLanguage("en");

		expect(html).toContain(noticesFr.status.published);
		expect(html).not.toContain(notices.status.published);
	});
});
