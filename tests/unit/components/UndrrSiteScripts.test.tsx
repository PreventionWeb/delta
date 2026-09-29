import { describe, it, expect, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
	UndrrSiteScripts,
	UNDRR_SITE_SCRIPT_URLS,
} from "~/components/UndrrSiteScripts";
import { configUndrrSiteScriptsEnabled } from "~/utils/config";

describe("configUndrrSiteScriptsEnabled", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("is disabled when the env var is not set", () => {
		vi.stubEnv("UNDRR_SITE_SCRIPTS_ENABLED", "");
		expect(configUndrrSiteScriptsEnabled()).toBe(false);
	});

	it("is enabled only for an explicit 'true' (case and whitespace tolerant)", () => {
		for (const value of ["true", "TRUE", " True "]) {
			vi.stubEnv("UNDRR_SITE_SCRIPTS_ENABLED", value);
			expect(configUndrrSiteScriptsEnabled()).toBe(true);
		}
		for (const value of ["false", "0", "yes", "1"]) {
			vi.stubEnv("UNDRR_SITE_SCRIPTS_ENABLED", value);
			expect(configUndrrSiteScriptsEnabled()).toBe(false);
		}
	});
});

describe("UndrrSiteScripts", () => {
	it("renders nothing when disabled", () => {
		const html = renderToStaticMarkup(<UndrrSiteScripts enabled={false} />);
		expect(html).toBe("");
	});

	it("renders the cookie banner, messaging and analytics includes when enabled", () => {
		const html = renderToStaticMarkup(<UndrrSiteScripts enabled={true} />);

		expect(html).toContain(
			`<link rel="stylesheet" href="${UNDRR_SITE_SCRIPT_URLS.cookieBannerCss}"/>`,
		);
		for (const src of [
			UNDRR_SITE_SCRIPT_URLS.cookieBannerLib,
			UNDRR_SITE_SCRIPT_URLS.cookieBannerConfig,
			UNDRR_SITE_SCRIPT_URLS.messaging,
			UNDRR_SITE_SCRIPT_URLS.analytics,
		]) {
			expect(html).toContain(`<script src="${src}" defer="">`);
		}
	});

	it("loads the cookie consent library before the UNDRR config that uses it", () => {
		const html = renderToStaticMarkup(<UndrrSiteScripts enabled={true} />);
		expect(html.indexOf(UNDRR_SITE_SCRIPT_URLS.cookieBannerLib)).toBeLessThan(
			html.indexOf(UNDRR_SITE_SCRIPT_URLS.cookieBannerConfig),
		);
	});

	it("points at the UNDRR-hosted asset URLs", () => {
		expect(UNDRR_SITE_SCRIPT_URLS).toEqual({
			cookieBannerCss:
				"https://assets.undrr.org/static/cookie-banner/v1/cookieconsent.css",
			cookieBannerLib:
				"https://assets.undrr.org/static/cookie-banner/v1/cookieconsent.umd.js",
			cookieBannerConfig:
				"https://assets.undrr.org/static/cookie-banner/v1/cookieconsent-undrr.js",
			messaging: "https://messaging.undrr.org/src/undrr-messaging.js",
			analytics:
				"https://assets.undrr.org/static/analytics/v1.0.0/google_analytics_enhancements.js",
		});
	});
});
