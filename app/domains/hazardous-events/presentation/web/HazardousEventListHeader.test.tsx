import { describe, it, expect, beforeAll } from "vitest";
import { renderToString } from "react-dom/server";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";

// Inline mirror of locales/en/hazardous-events.json's list.count_in_instance key
// (Notices precedent -- no file import).
const hazardousEvents = {
	list: {
		count_in_instance: "{{count}} hazardous event(s) in {{instance}}",
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

function renderAt(ui: React.ReactElement): string {
	return renderToString(
		<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>,
	);
}

describe("HazardousEventListHeader (design.md Decision 15)", () => {
	it("renders the unfiltered total and instance name", async () => {
		const { HazardousEventListHeader } =
			await import("~/domains/hazardous-events/presentation/web/HazardousEventListHeader");

		const html = renderAt(
			<HazardousEventListHeader
				totalCount={42}
				instanceName="Example Country Instance"
			/>,
		);

		expect(html).toContain("42 hazardous event(s) in Example Country Instance");
	});

	// No role prop exists on this component at all -- legacy's own HazardEventHeader renders
	// unconditionally, with no permission concept involved.
	it("renders unconditionally -- takes no role prop", async () => {
		const { HazardousEventListHeader } =
			await import("~/domains/hazardous-events/presentation/web/HazardousEventListHeader");

		const html = renderAt(
			<HazardousEventListHeader
				totalCount={0}
				instanceName="DELTA Resilience"
			/>,
		);

		expect(html).toContain("0 hazardous event(s) in DELTA Resilience");
	});
});
