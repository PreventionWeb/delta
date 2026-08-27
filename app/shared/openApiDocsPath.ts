// Single source of truth for the OpenAPI docs route — mountOpenApiDocs() (app/init.server.tsx)
// and DomainErrorFilter.server.ts's unmatched-route documentationUrl (design.md Decision 15)
// must never drift apart on where the docs UI actually lives.
export const API_GLOBAL_PREFIX = "/api/v2";
export const OPENAPI_DOCS_SUBPATH = "docs";
export const OPENAPI_DOCS_PATH = `${API_GLOBAL_PREFIX}/${OPENAPI_DOCS_SUBPATH}`;
