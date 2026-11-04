// Single source of truth for the OpenAPI docs route — mountOpenApiDocs() (app/init.server.tsx)
// and DomainErrorFilter.server.ts's unmatched-route documentationUrl (design.md Decision 15)
// must never drift apart on where the docs UI actually lives.
export const API_GLOBAL_PREFIX = "/api/v2";
export const OPENAPI_DOCS_SUBPATH = "docs";
export const OPENAPI_DOCS_PATH = `${API_GLOBAL_PREFIX}/${OPENAPI_DOCS_SUBPATH}`;
export const OPENAPI_DOCS_JSON_PATH = `${OPENAPI_DOCS_PATH}-json`;
export const OPENAPI_DOCS_LEGACY_PATH = "/api/docs";
export const OPENAPI_DOCS_LEGACY_JSON_PATH = "/api/docs-json";
