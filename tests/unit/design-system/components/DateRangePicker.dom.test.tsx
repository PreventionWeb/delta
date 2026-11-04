import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { DateRangePicker } from "~/design-system/components/DateRangePicker";

describe("DateRangePicker", () => {
	it('renders exactly two <input type="date"> elements, one per given name', () => {
		const { container } = render(
			<DateRangePicker
				fromName="fromDate"
				fromLabel="From"
				toName="toDate"
				toLabel="To"
			/>,
		);

		const dateInputs = container.querySelectorAll('input[type="date"]');
		expect(dateInputs.length).toBe(2);

		const names = Array.from(dateInputs).map(
			(el) => (el as HTMLInputElement).name,
		);
		expect(names).toContain("fromDate");
		expect(names).toContain("toDate");
	});

	it("setting only the from field does not require the to field", () => {
		let submitted: URLSearchParams | undefined;
		const { container } = render(
			<form
				method="get"
				onSubmit={(e) => {
					e.preventDefault();
					const entries = Array.from(
						new FormData(e.currentTarget).entries(),
					) as [string, string][];
					submitted = new URLSearchParams(entries);
				}}
			>
				<DateRangePicker
					fromName="fromDate"
					fromLabel="From"
					toName="toDate"
					toLabel="To"
				/>
				<button type="submit">Apply</button>
			</form>,
		);

		const form = container.querySelector("form") as HTMLFormElement;
		const fromInput = container.querySelector(
			'input[name="fromDate"]',
		) as HTMLInputElement;
		const toInput = container.querySelector(
			'input[name="toDate"]',
		) as HTMLInputElement;

		fireEvent.change(fromInput, { target: { value: "2024-01-15" } });

		expect(fromInput.value).toBe("2024-01-15");
		expect(toInput.hasAttribute("required")).toBe(false);
		expect(toInput.value).toBe("");

		// The real "does not require the other field" check: native validation does not block submit.
		expect(form.checkValidity()).toBe(true);

		fireEvent.submit(form);
		expect(submitted?.get("fromDate")).toBe("2024-01-15");
	});
});
