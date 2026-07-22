import { describe, it, expect, vi, beforeAll } from "vitest";
import { renderToString } from "react-dom/server";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import type { ErrorResponse } from "~/shared/errors/ErrorResponse";

let mockError: unknown;
let mockIsRouteErrorResponse: (error: unknown) => boolean;

vi.mock("react-router", () => ({
	useRouteError: () => mockError,
	isRouteErrorResponse: (error: unknown) => mockIsRouteErrorResponse(error),
}));

import { NoticeErrorBoundary } from "~/domains/notices/presentation/NoticeErrorBoundary";

function makeResponseError(body: ErrorResponse) {
	return { data: body };
}

// Inline mirror of locales/en/common.json's error keys (design.md Decision 5 — no file import).
const common = {
	error: {
		generic: "An unexpected error occurred.",
		generic_retry: "An unexpected error occurred. Please try again later.",
	},
};

// French error keys only — proves real i18next resolution vs. the hardcoded English literal.
const commonFr = {
	error: {
		generic: "Une erreur inattendue s'est produite.",
		generic_retry:
			"Une erreur inattendue s'est produite. Veuillez réessayer plus tard.",
	},
};

let testI18n: I18n;

beforeAll(async () => {
	testI18n = i18n.createInstance();
	await testI18n.use(initReactI18next).init({
		lng: "en",
		fallbackLng: "en",
		ns: ["common"],
		defaultNS: "common",
		resources: { en: { common }, fr: { common: commonFr } },
	});
});

function renderWithI18n(): string {
	return renderToString(
		<I18nextProvider i18n={testI18n}>
			<NoticeErrorBoundary />
		</I18nextProvider>,
	);
}

describe("NoticeErrorBoundary", () => {
	it("renders the message and a copyable traceId for a thrown Response envelope", () => {
		mockIsRouteErrorResponse = () => true;
		mockError = makeResponseError({
			success: false,
			error: {
				code: "NOT_FOUND",
				message: "Notice not found",
				traceId: "trace-1",
				timestamp: "2026-07-02T00:00:00.000Z",
			},
		});

		const html = renderWithI18n();

		expect(html).toContain("Notice not found");
		expect(html).toContain("trace-1");
	});

	it("does not crash and still shows error.message when details is present", () => {
		mockIsRouteErrorResponse = () => true;
		mockError = makeResponseError({
			success: false,
			error: {
				code: "VALIDATION_ERROR",
				message: "Invalid request",
				details: { entity: "Notice", id: "abc" },
				traceId: "trace-2",
				timestamp: "2026-07-02T00:00:00.000Z",
			},
		});

		const html = renderWithI18n();

		expect(html).toContain("Invalid request");
		expect(html).not.toContain("[object Object]");
	});

	it("renders a generic fallback and never leaks .message/.stack for a plain Error", () => {
		mockIsRouteErrorResponse = () => false;
		mockError = new Error("Internal secret stack detail");

		const html = renderWithI18n();

		expect(html).not.toContain("Internal secret stack detail");
		expect(html).toContain(common.error.generic_retry);
	});

	it("does not render a blank or 'undefined' traceId for a plain Error", () => {
		mockIsRouteErrorResponse = () => false;
		mockError = new Error("boom");

		const html = renderWithI18n();

		expect(html).not.toContain("undefined");
	});

	it("never interpolates error.message into the translated fallback text", () => {
		mockIsRouteErrorResponse = () => false;
		mockError = new Error("SECRET-MARKER-XYZ");

		const html = renderWithI18n();

		expect(html).toContain(`<p>${common.error.generic_retry}</p>`);
		expect(html).not.toContain("SECRET-MARKER-XYZ");
	});

	it("renders the French fallback text when the i18n instance's language is fr", async () => {
		mockIsRouteErrorResponse = () => false;
		mockError = new Error("boom");
		await testI18n.changeLanguage("fr");

		const html = renderWithI18n();
		await testI18n.changeLanguage("en");

		// react-dom/server HTML-escapes the apostrophe, so match around it rather than verbatim.
		expect(html).toContain("Une erreur inattendue s");
		expect(html).toContain("est produite. Veuillez réessayer plus tard.");
	});
});
