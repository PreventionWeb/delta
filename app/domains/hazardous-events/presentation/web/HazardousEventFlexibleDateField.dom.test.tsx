import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import { HazardousEventFlexibleDateField } from "./HazardousEventFlexibleDateField";

const hazardousEvents = {
	form: {
		fields: {
			date_format_label: "Format",
			date_format_options: {
				full_date: "Full date",
				year_month: "Year and month",
				year_only: "Year only",
			},
			date_value_label: "Date",
			date_year_label: "Year",
			date_month_label: "Month",
			select_month: "Select",
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

function renderField(
	props: Partial<
		React.ComponentProps<typeof HazardousEventFlexibleDateField>
	> = {},
) {
	return render(
		<I18nextProvider i18n={testI18n}>
			<HazardousEventFlexibleDateField
				name="startDate"
				label="Start date"
				initialValue=""
				{...props}
			/>
		</I18nextProvider>,
	);
}

function hiddenInput(container: HTMLElement): HTMLInputElement {
	return container.querySelector(
		'input[type="hidden"][name="startDate"]',
	) as HTMLInputElement;
}

describe("HazardousEventFlexibleDateField (design.md Decision 9, Gate 9 finding)", () => {
	it("defaults to Full date precision with a native required date input", () => {
		renderField();

		const formatSelect = screen.getByRole("combobox", {
			name: "Start date Format",
		}) as HTMLSelectElement;
		expect(formatSelect.value).toBe("yyyy-mm-dd");
		const dateInput = screen.getByLabelText(
			"Start date Date *",
		) as HTMLInputElement;
		expect(dateInput.type).toBe("date");
		expect(dateInput.required).toBe(true);
	});

	it("switches to a required-year text input plus a month select under Year and month precision", async () => {
		const user = userEvent.setup();
		renderField();

		await user.selectOptions(
			screen.getByRole("combobox", { name: "Start date Format" }),
			"yyyy-mm",
		);

		expect(screen.queryByLabelText("Start date Date *")).toBeNull();
		const yearInput = screen.getByLabelText(
			"Start date Year *",
		) as HTMLInputElement;
		expect(yearInput.getAttribute("pattern")).toBe("\\d{4}");
		expect(yearInput.required).toBe(true);
		expect(
			screen.getByRole("combobox", { name: "Start date Month" }),
		).toBeTruthy();
	});

	it("switches to only a required-year text input under Year only precision", async () => {
		const user = userEvent.setup();
		renderField();

		await user.selectOptions(
			screen.getByRole("combobox", { name: "Start date Format" }),
			"yyyy",
		);

		expect(screen.queryByLabelText("Start date Date *")).toBeNull();
		expect(
			screen.queryByRole("combobox", { name: "Start date Month" }),
		).toBeNull();
		const yearInput = screen.getByLabelText(
			"Start date Year *",
		) as HTMLInputElement;
		expect(yearInput.required).toBe(true);
	});

	it("derives Year and month precision from a 7-char initial value, pre-filling year/month", () => {
		renderField({ initialValue: "2026-03" });

		const formatSelect = screen.getByRole("combobox", {
			name: "Start date Format",
		}) as HTMLSelectElement;
		expect(formatSelect.value).toBe("yyyy-mm");
		const yearInput = screen.getByLabelText(
			"Start date Year *",
		) as HTMLInputElement;
		expect(yearInput.value).toBe("2026");
		const monthSelect = screen.getByRole("combobox", {
			name: "Start date Month",
		}) as HTMLSelectElement;
		expect(monthSelect.value).toBe("3");
	});

	it("derives Year only precision from a 4-char initial value", () => {
		renderField({ initialValue: "2026" });

		const formatSelect = screen.getByRole("combobox", {
			name: "Start date Format",
		}) as HTMLSelectElement;
		expect(formatSelect.value).toBe("yyyy");
		const yearInput = screen.getByLabelText(
			"Start date Year *",
		) as HTMLInputElement;
		expect(yearInput.value).toBe("2026");
	});

	it("updates the hidden startDate input to the full yyyy-mm-dd value as the date input changes", () => {
		const { container } = renderField();

		fireEvent.change(screen.getByLabelText("Start date Date *"), {
			target: { value: "2026-05-20" },
		});

		expect(hiddenInput(container).value).toBe("2026-05-20");
	});

	it("updates the hidden startDate input to yyyy-mm once both year and month are filled", async () => {
		const user = userEvent.setup();
		const { container } = renderField();

		await user.selectOptions(
			screen.getByRole("combobox", { name: "Start date Format" }),
			"yyyy-mm",
		);
		await user.type(screen.getByLabelText("Start date Year *"), "2026");
		await user.selectOptions(
			screen.getByRole("combobox", { name: "Start date Month" }),
			"5",
		);

		expect(hiddenInput(container).value).toBe("2026-05");
	});

	it("renders field errors under the value row, not the Format row", () => {
		renderField({ errors: ["startDate must not be later than endDate"] });

		expect(
			screen.getByText("startDate must not be later than endDate"),
		).toBeTruthy();
	});
});
