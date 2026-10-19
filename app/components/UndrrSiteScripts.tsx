/**
 * UNDRR-wide client-side tooling: cookie consent banner, emergency messaging
 * and Google Analytics enhancements. These are the same drop-in includes used
 * on other UNDRR sites (see https://assets.undrr.org/static/).
 *
 * Opt-in via UNDRR_SITE_SCRIPTS_ENABLED — intended for UNDRR-hosted instances
 * such as www.deltaresilience.org, not for national deployments.
 *
 * The analytics script picks the GA4 measurement ID from the hostname
 * (www.deltaresilience.org → G-R33E9413Q5) and is a no-op on other hosts.
 *
 * See undrr/web-backlog#2495.
 */

export const UNDRR_SITE_SCRIPT_URLS = {
	cookieBannerCss:
		"https://assets.undrr.org/static/cookie-banner/v1/cookieconsent.css",
	cookieBannerLib:
		"https://assets.undrr.org/static/cookie-banner/v1/cookieconsent.umd.js",
	// Must load after cookieBannerLib; `defer` preserves document order.
	cookieBannerConfig:
		"https://assets.undrr.org/static/cookie-banner/v1/cookieconsent-undrr.js",
	messaging: "https://messaging.undrr.org/src/undrr-messaging.js",
	analytics:
		"https://assets.undrr.org/static/analytics/v1.0.0/google_analytics_enhancements.js",
} as const;

interface UndrrSiteScriptsProps {
	enabled: boolean;
}

export function UndrrSiteScripts({ enabled }: UndrrSiteScriptsProps) {
	if (!enabled) {
		return null;
	}

	return (
		<>
			<link rel="stylesheet" href={UNDRR_SITE_SCRIPT_URLS.cookieBannerCss} />
			<script src={UNDRR_SITE_SCRIPT_URLS.cookieBannerLib} defer />
			<script src={UNDRR_SITE_SCRIPT_URLS.cookieBannerConfig} defer />
			<script src={UNDRR_SITE_SCRIPT_URLS.messaging} defer />
			<script src={UNDRR_SITE_SCRIPT_URLS.analytics} defer />
		</>
	);
}
