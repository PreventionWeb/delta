import { describe, it, expect, vi } from "vitest";
import i18n from "i18next";
import { translateAuditLogAction } from "./translateAuditLogAction";

// Real i18next instance (not a fake TFunction cast) with distinguishable, non-English-looking
// resource values, so a passing assertion proves t() was actually called and interpolated.
const testI18n = i18n.createInstance();
await testI18n.init({
	lng: "en",
	resources: {
		en: {
			"hazardous-events": {
				detail: {
					audit_log: {
						actions: {
							create: "CREATED::{{obj}}",
							update: "UPDATED::{{obj}}",
							delete: "DELETED::{{obj}}",
						},
						object_hazardous_event: "HE-OBJ",
					},
				},
			},
		},
	},
});
const t = testI18n.getFixedT("en", "hazardous-events");

describe("translateAuditLogAction", () => {
	it.each([
		["Create hazardous event", "CREATED::HE-OBJ"],
		["Update hazardous event", "UPDATED::HE-OBJ"],
		["Delete hazardous event", "DELETED::HE-OBJ"],
	])(
		"translates %s via t(), interpolating the object label",
		(action, expected) => {
			expect(translateAuditLogAction(action, t)).toBe(expected);
		},
	);

	it.each(["Submit draft", "Delete", "delete"])(
		"returns %s unchanged, without calling t for the action itself",
		(action) => {
			const spy = vi.fn(t);

			expect(translateAuditLogAction(action, spy)).toBe(action);
			expect(spy).not.toHaveBeenCalled();
		},
	);
});
