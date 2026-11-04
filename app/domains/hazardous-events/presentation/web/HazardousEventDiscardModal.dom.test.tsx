import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import { HazardousEventDiscardModal } from "./HazardousEventDiscardModal";

const hazardousEvents = {
	form: {
		discard: {
			title: "Discard changes",
			confirm_message:
				"Save this record as a draft, or discard your changes and exit without saving.",
			save_as_draft: "Save as draft",
			discard_and_exit: "Discard work and exit",
		},
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

function renderModal() {
	return render(
		<I18nextProvider i18n={testI18n}>
			<HazardousEventDiscardModal
				visible
				onHide={() => {}}
				onSaveAsDraft={() => {}}
				onDiscard={() => {}}
			/>
		</I18nextProvider>,
	);
}

// design.md Decision 9 addendum (found live, 2026-11-02): legacy stacks "Save as draft"
// (primary) above "Discard work and exit" (outline) -- a pure visual-parity fix, no behavior
// change to either callback.
describe("HazardousEventDiscardModal footer (task 9c)", () => {
	it("renders Save as draft before Discard work and exit, in a vertical stack", () => {
		renderModal();

		const saveButton = screen.getByRole("button", { name: "Save as draft" });
		const discardButton = screen.getByRole("button", {
			name: "Discard work and exit",
		});

		// DOCUMENT_POSITION_FOLLOWING on discardButton means saveButton comes first in source order.
		expect(
			saveButton.compareDocumentPosition(discardButton) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();

		const container = saveButton.parentElement;
		expect(container).toBe(discardButton.parentElement);
		expect(container?.className).toContain("flex-col");
	});

	it("renders Save as draft as the primary (filled) action", () => {
		renderModal();

		const saveButton = screen.getByRole("button", { name: "Save as draft" });
		expect(saveButton.className).toContain("mg-button-primary");
		expect(saveButton.className).not.toContain("mg-button-outline");
	});

	it("renders Discard work and exit as the outline (secondary) action", () => {
		renderModal();

		const discardButton = screen.getByRole("button", {
			name: "Discard work and exit",
		});
		expect(discardButton.className).toContain("mg-button-outline");
		expect(discardButton.className).not.toContain("mg-button-primary");
	});
});
