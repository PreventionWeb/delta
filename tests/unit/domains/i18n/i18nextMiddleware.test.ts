import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import type { createI18nextMiddleware } from "remix-i18next";
import type { RouterContextProvider } from "react-router";

// Avoids transitively pulling in ~/db.server (and its PGlite schema-pull cost)
// for a test that only inspects config construction.
vi.mock("~/utils/session", () => ({
	getCountrySettingsFromSession: vi.fn(),
}));

// Spy on createI18nextMiddleware to inspect the Options object the module builds,
// and control what getInstance(context) returns for getResourceBundle's tests.
const { createI18nextMiddlewareMock, getInstanceMock } = vi.hoisted(() => {
	const getInstanceMock = vi.fn();
	const createI18nextMiddlewareMock = vi.fn(
		(_options: createI18nextMiddleware.Options) =>
			[vi.fn(), vi.fn(), getInstanceMock] as const,
	);
	return { createI18nextMiddlewareMock, getInstanceMock };
});

vi.mock("remix-i18next", () => ({
	createI18nextMiddleware: createI18nextMiddlewareMock,
}));

import FsBackend from "i18next-fs-backend";
import { getResourceBundle } from "~/middleware/i18next.server";

describe("i18nextMiddleware config", () => {
	it("configures plugins: [FsBackend] with a disk loadPath, not i18next: { resources }", () => {
		expect(createI18nextMiddlewareMock).toHaveBeenCalledTimes(1);
		const options = createI18nextMiddlewareMock.mock.calls[0][0];

		expect(options.plugins).toEqual([FsBackend]);
		expect(options.i18next).not.toHaveProperty("resources");
		const backend = options.i18next?.backend as
			| { loadPath?: string }
			| undefined;
		expect(backend?.loadPath).toBe(
			join(process.cwd(), "locales/{{lng}}/{{ns}}.json"),
		);
	});

	it('configures detection.order as exactly ["custom"] — no cookie/session/header steps', () => {
		const options = createI18nextMiddlewareMock.mock.calls[0][0];
		expect(options.detection.order).toEqual(["custom"]);
		expect(typeof options.detection.findLocale).toBe("function");
	});
});

describe("getResourceBundle", () => {
	const fakeContext = {} as RouterContextProvider;

	it("returns getInstance(context).getDataByLanguage(lang)", () => {
		getInstanceMock.mockReturnValue({
			getDataByLanguage: vi
				.fn()
				.mockReturnValue({ translation: { greeting: "hi" } }),
		});

		expect(getResourceBundle(fakeContext, "en")).toEqual({
			translation: { greeting: "hi" },
		});
	});

	it("falls back to {} when getDataByLanguage returns undefined", () => {
		getInstanceMock.mockReturnValue({
			getDataByLanguage: vi.fn().mockReturnValue(undefined),
		});

		expect(getResourceBundle(fakeContext, "en")).toEqual({});
	});
});
