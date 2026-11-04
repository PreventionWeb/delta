# UNDRR site scripts (cookie banner, emergency messaging, analytics)

UNDRR-hosted instances such as `www.deltaresilience.org` load the same client-side tooling as other UNDRR sites:

| Script                                                       | URL                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Cookie consent banner (vanilla-cookieconsent + UNDRR config) | `https://assets.undrr.org/static/cookie-banner/v1/`                                 |
| Emergency messaging                                          | `https://messaging.undrr.org/src/undrr-messaging.js`                                |
| Google Analytics enhancements                                | `https://assets.undrr.org/static/analytics/v1.0.0/google_analytics_enhancements.js` |

These are plain `<script defer>` includes. They have no dependency on Mangrove or on the DELTA build. See undrr/web-backlog#2495.

## Enabling

`example.env` ships with the scripts enabled:

```bash
UNDRR_SITE_SCRIPTS_ENABLED="true"
```

Any other value (or removing the variable) turns them off. National deployments should set it to `"false"`: when enabled, pages load UNDRR's cookie banner and UNDRR-wide emergency messages, and every page load sends requests to `assets.undrr.org` and `messaging.undrr.org`.

## How it works

- `configUndrrSiteScriptsEnabled()` in `app/utils/config.ts` reads the env var.
- The root loader passes it to the client as `env.UNDRR_SITE_SCRIPTS_ENABLED`.
- `app/components/UndrrSiteScripts.tsx` renders the includes in `<head>`, both in the main layout and in the root `ErrorBoundary`.

The GA script picks the GA4 measurement ID from `window.location.hostname`. On `www.deltaresilience.org` it uses `G-R33E9413Q5`. On any hostname it doesn't recognise (including `localhost`) it does nothing, so no ID needs to be configured in DELTA. New hostnames are added in the analytics script itself, not here.

## Content Security Policy

The dev server CSP (`vite.config.ts`) already allows these hosts. If a production proxy sets its own CSP, it must allow:

- `script-src`: `https://assets.undrr.org https://messaging.undrr.org https://www.googletagmanager.com`
- `style-src`: `https://assets.undrr.org`
- `connect-src`: `https://assets.undrr.org` (cookie banner `config.json`) and `https://*.google-analytics.com`
- `img-src`: `https://*.google-analytics.com https://*.googletagmanager.com`

## Verifying

1. Open the site in a browser with devtools open.
2. The cookie banner appears at the bottom on first visit. The console logs `Cookie banner initialized successfully`.
3. Append `#enableMessagingDebug=true` to the URL and reload. A messaging debug banner appears at the top of the page.
4. On `www.deltaresilience.org`, GA4 DebugView (stream `12309071953`) shows a `page_view`. For verbose GA logging, run `document.body.setAttribute("data-vf-google-analytics-verbose", "true")` before load.

## Known limitations

- Only the initial page load sends a `page_view`, because the analytics script runs once per full page load. Whether client-side (React Router) navigations are recorded depends on the GA4 stream's enhanced measurement "page changes based on browser history events" setting. Check this in DebugView.
- The analytics script does not wait for cookie consent. This matches its behaviour on other UNDRR sites.
