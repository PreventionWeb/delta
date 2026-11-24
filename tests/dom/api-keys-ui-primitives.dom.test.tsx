import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Callout, TextField } from "~/design-system/ui";

describe("Callout", () => {
	it("renders success tone with role=status, title, and body", () => {
		render(
			<Callout tone="success" title="National statistics sync is ready to use">
				Copy the key and add it to the application that needs it.
			</Callout>,
		);

		const status = screen.getByRole("status");
		expect(status).toBeTruthy();
		expect(status.className).toContain("bg-good-bg");
		expect(status.className).toContain("border-good-border");
		expect(
			screen.getByText("National statistics sync is ready to use"),
		).toBeTruthy();
		expect(
			screen.getByText(
				"Copy the key and add it to the application that needs it.",
			),
		).toBeTruthy();
	});

	it("renders error tone with role=alert", () => {
		render(<Callout tone="error">Something went wrong.</Callout>);

		const alert = screen.getByRole("alert");
		expect(alert).toBeTruthy();
		expect(alert.className).toContain("bg-crit-bg");
		expect(alert.className).toContain("border-crit-border");
		expect(screen.getByText("Something went wrong.")).toBeTruthy();
	});
});

describe("TextField read-only and focus props", () => {
	it("renders read-only input and invokes onFocus", () => {
		const handleFocus = vi.fn();
		render(
			<TextField
				label="Key"
				value="dk_1234567890"
				isReadOnly
				onFocus={handleFocus}
			/>,
		);

		const input = screen.getByLabelText("Key") as HTMLInputElement;
		expect(input.readOnly).toBe(true);
		expect(input.value).toBe("dk_1234567890");

		fireEvent.focus(input);
		expect(handleFocus).toHaveBeenCalledTimes(1);
	});

	it("remains editable when isReadOnly is omitted", () => {
		const handleChange = vi.fn();
		render(<TextField label="Name" value="" onChange={handleChange} />);

		const input = screen.getByLabelText("Name") as HTMLInputElement;
		expect(input.readOnly).toBe(false);
		fireEvent.change(input, { target: { value: "My key" } });
		expect(handleChange).toHaveBeenCalledWith("My key");
	});
});
