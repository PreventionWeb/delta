import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "~/design-system/components/Checkbox";

describe("Checkbox", () => {
	it('renders a native <input type="checkbox"> element', () => {
		render(<Checkbox name="example" label="Example" defaultChecked={false} />);

		const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
		expect(checkbox.tagName).toBe("INPUT");
		expect(checkbox.type).toBe("checkbox");
	});

	it("is keyboard-activatable: starts unchecked, Tab reaches it, Space toggles it", async () => {
		const user = userEvent.setup();
		render(<Checkbox name="example" label="Example" defaultChecked={false} />);

		const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
		expect(checkbox.checked).toBe(false);

		await user.tab();
		expect(document.activeElement).toBe(checkbox);

		await user.keyboard(" ");
		expect(checkbox.checked).toBe(true);
		// Reports its checked state correctly to assistive technology via the accessible-checked query.
		expect(screen.getByRole("checkbox", { checked: true })).toBe(checkbox);
	});

	it("renders its name prop as the native input's name attribute", () => {
		render(
			<Checkbox
				name="viewMyRecords"
				label="View my records"
				defaultChecked={false}
			/>,
		);

		const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
		expect(checkbox.name).toBe("viewMyRecords");
	});

	it("renders the given label content in the document", () => {
		render(
			<Checkbox
				name="example"
				label="View my records"
				defaultChecked={false}
			/>,
		);

		expect(screen.getByText("View my records")).not.toBeNull();
		// Label text and input are associated via the wrapping <label>, so this also works:
		expect(
			screen.getByRole("checkbox", { name: "View my records" }),
		).not.toBeNull();
	});
});
