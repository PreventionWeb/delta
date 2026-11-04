import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import type { ValidatorCandidate } from "~/domains/validation-workflow/application/ports/IValidatorCandidateRepository";
import { HazardousEventSaveSubmitModal } from "./HazardousEventSaveSubmitModal";

const hazardousEvents = {
	form: {
		save_submit: {
			title: "Save or submit",
			decide_action: "Decide what you'd like to do.",
			select_validators: "Select validator(s)",
			publish_to_undrr: "Publish to UNDRR instance",
			publish_to_undrr_description: "Made public.",
			actions: {
				save_draft: "Save as draft",
				validate: "Validate record",
				validate_and_publish: "Validate and publish record",
				submit_for_validation: "Submit for validation",
			},
			descriptions: {
				save_draft: "Store for later",
				validate: "Checked for accuracy",
				submit_for_validation: "Request validation",
			},
			card_titles: {
				validate: "Validate",
			},
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

const CANDIDATES: ValidatorCandidate[] = [
	{ id: "v1", firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
];

function renderModal(role: string | null) {
	return render(
		<I18nextProvider i18n={testI18n}>
			<HazardousEventSaveSubmitModal
				visible
				onHide={() => {}}
				onSubmit={() => {}}
				validatorCandidates={CANDIDATES}
				role={role}
			/>
		</I18nextProvider>,
	);
}

// design.md Decision 9's card-visibility table: submit-draft is every role; direct-validate/
// direct-publish is admin-only; submit-validation is data-validator/data-collector/admin.
describe("HazardousEventSaveSubmitModal card visibility per role (task 9.11)", () => {
	it("shows submit-draft and submit-validation cards, but not the admin-only card, for data-collector", () => {
		renderModal("data-collector");

		expect(screen.getByRole("radio", { name: "Save as draft" })).toBeTruthy();
		expect(
			screen.getByRole("radio", { name: "Submit for validation" }),
		).toBeTruthy();
		expect(screen.queryByRole("radio", { name: "Validate" })).toBeNull();
	});

	it("shows submit-draft and submit-validation cards, but not the admin-only card, for data-validator", () => {
		renderModal("data-validator");

		expect(screen.getByRole("radio", { name: "Save as draft" })).toBeTruthy();
		expect(
			screen.getByRole("radio", { name: "Submit for validation" }),
		).toBeTruthy();
		expect(screen.queryByRole("radio", { name: "Validate" })).toBeNull();
	});

	it("shows all three cards for admin", () => {
		renderModal("admin");

		expect(screen.getByRole("radio", { name: "Save as draft" })).toBeTruthy();
		expect(screen.getByRole("radio", { name: "Validate" })).toBeTruthy();
		expect(
			screen.getByRole("radio", { name: "Submit for validation" }),
		).toBeTruthy();
	});

	it("shows only the submit-draft card for data-viewer", () => {
		renderModal("data-viewer");

		expect(screen.getByRole("radio", { name: "Save as draft" })).toBeTruthy();
		expect(screen.queryByRole("radio", { name: "Validate" })).toBeNull();
		expect(
			screen.queryByRole("radio", { name: "Submit for validation" }),
		).toBeNull();
	});

	it("submit-validation's own submit button stays disabled until a validator is selected", () => {
		renderModal("admin");

		screen.getByRole("radio", { name: "Submit for validation" }).click();

		const submitButton = screen.getByRole("button", {
			name: "Submit for validation",
		}) as HTMLButtonElement;
		expect(submitButton.disabled).toBe(true);
	});
});

// design.md Decision 9 (Gate 9 finding) -- legacy's SaveSubmitDialog.tsx renders a colored
// circular icon badge (PrimeIcons) to the left of each card's title; the ported modal had none.
describe("HazardousEventSaveSubmitModal icon badges (design.md Decision 9, Gate 9 finding)", () => {
	it("renders a pi-save icon badge on the submit-draft card", () => {
		renderModal("data-collector");
		const saveRadio = screen.getByRole("radio", { name: "Save as draft" });
		const card = saveRadio.closest("div");
		expect(card?.querySelector(".pi-save")).toBeTruthy();
		// Rendered once per card, not duplicated elsewhere in the dialog. PrimeReact's Dialog
		// portals its content outside the render()-returned container, so this must query
		// document.body (where screen's own queries already resolve against), not container.
		expect(document.body.querySelectorAll(".pi-save").length).toBe(1);
	});

	it("renders a pi-shield icon badge on the admin-only validate card", () => {
		renderModal("admin");
		const validateRadio = screen.getByRole("radio", { name: "Validate" });
		const card = validateRadio.closest("div");
		expect(card?.querySelector(".pi-shield")).toBeTruthy();
	});

	it("renders a pi-send icon badge on the submit-validation card", () => {
		renderModal("admin");
		const submitRadio = screen.getByRole("radio", {
			name: "Submit for validation",
		});
		const card = submitRadio.closest("div");
		expect(card?.querySelector(".pi-send")).toBeTruthy();
	});
});
