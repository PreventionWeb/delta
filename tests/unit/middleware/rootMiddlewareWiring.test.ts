import { describe, expect, it } from "vitest";

// Guards against silent de-wiring (design.md Decision 6): a full render/E2E
// test would prove the middleware is invoked by the real router, but this
// proposal's specified test tier is "Unit" (see design.md Risks). This cheap,
// still-unit-level check at least proves root.tsx has not lost the export.
import * as root from "~/root";
import { requestContextMiddleware } from "~/middleware/requestContext.server";
import { i18nextMiddleware } from "~/middleware/i18next.server";

describe("root.tsx middleware wiring", () => {
	it("exports requestContextMiddleware in its middleware array by reference", () => {
		expect(Array.isArray(root.middleware)).toBe(true);
		expect(root.middleware).toContain(requestContextMiddleware);
	});

	// See openspec/changes/ca-i18n-adr001-infra/specs/i18n-ssr-middleware/spec.md
	// "i18nextMiddleware is registered alongside, not instead of, requestContextMiddleware".
	it("also exports i18nextMiddleware, appended after requestContextMiddleware", () => {
		expect(root.middleware).toContain(i18nextMiddleware);
		const requestContextIndex = root.middleware.indexOf(
			requestContextMiddleware,
		);
		const i18nextIndex = root.middleware.indexOf(i18nextMiddleware);
		expect(i18nextIndex).toBeGreaterThan(requestContextIndex);
	});
});
