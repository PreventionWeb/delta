import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	MultiSelectCombobox,
	type MultiSelectComboboxOption,
} from "./MultiSelectCombobox";

// jsdom tier only -- real interaction needed (typing, selecting, removing a chip). No node-tier
// sibling file for this component (design.md Decision 12, tasks.md 9a.4).

const OPTIONS: MultiSelectComboboxOption[] = [
	{ id: "1", name: "Jane Doe" },
	{ id: "2", name: "John Smith" },
];

// Controlled component (selectedIds/onSelectionChange), same convention as this design system's
// other controlled primitives (Checkbox.tsx's own checked/onChange note) -- the harness owns the
// state a real caller would own.
function ControlledHarness({
	initialSelectedIds = [],
	onSelectionChange,
	disabled,
}: {
	initialSelectedIds?: readonly string[];
	onSelectionChange?: (ids: readonly string[]) => void;
	disabled?: boolean;
}) {
	const [selectedIds, setSelectedIds] =
		useState<readonly string[]>(initialSelectedIds);
	return (
		<MultiSelectCombobox
			name="validators"
			label="Validators"
			options={OPTIONS}
			selectedIds={selectedIds}
			disabled={disabled}
			onSelectionChange={(ids) => {
				setSelectedIds(ids);
				onSelectionChange?.(ids);
			}}
			removeLabel={(name) => `Remove ${name}`}
		/>
	);
}

describe("MultiSelectCombobox", () => {
	it('typing "jane" filters the displayed option list to include "Jane Doe" (case-insensitive)', async () => {
		const user = userEvent.setup();
		render(<ControlledHarness />);

		await user.type(screen.getByLabelText("Validators"), "jane");

		const option = await screen.findByRole("option", { name: "Jane Doe" });
		expect(option).toBeTruthy();
		expect(screen.queryByRole("option", { name: "John Smith" })).toBeNull();
	});

	it("selecting two different options renders one chip per selection, each showing its name", async () => {
		const user = userEvent.setup();
		render(<ControlledHarness />);
		const input = screen.getByLabelText("Validators");

		await user.type(input, "jane");
		await user.click(await screen.findByRole("option", { name: "Jane Doe" }));

		await user.clear(input);
		await user.type(input, "john");
		await user.click(await screen.findByRole("option", { name: "John Smith" }));

		// Each chip's removal control is named "Remove <option name>" -- the one concrete,
		// accessible-name contract this test imposes on the implementation (query by role/name,
		// not CSS classes, per this family's own test-authoring convention).
		expect(
			screen.getByRole("button", { name: "Remove Jane Doe" }),
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Remove John Smith" }),
		).toBeTruthy();
	});

	it("removing a selected chip removes it from the DOM and drops its id from onSelectionChange's value", async () => {
		const user = userEvent.setup();
		const onSelectionChange = vi.fn();
		render(
			<ControlledHarness
				initialSelectedIds={["1", "2"]}
				onSelectionChange={onSelectionChange}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Remove Jane Doe" }));

		expect(
			screen.queryByRole("button", { name: "Remove Jane Doe" }),
		).toBeNull();
		expect(onSelectionChange).toHaveBeenCalled();
		const lastCallIds = onSelectionChange.mock.calls.at(-1)?.[0] as string[];
		expect(lastCallIds).not.toContain("1");
	});

	it("a hidden input named `name` carries the real comma-joined selection, not the transient filter text", () => {
		render(<ControlledHarness initialSelectedIds={["1", "2"]} />);

		const hidden = document.querySelector(
			'input[type="hidden"][name="validators"]',
		) as HTMLInputElement;
		expect(hidden).toBeTruthy();
		expect(hidden.value).toBe("1,2");
		// The visible filter input must not carry `name` -- it is transient text, not the value.
		expect(screen.getByLabelText("Validators")).not.toHaveProperty(
			"name",
			"validators",
		);
	});

	it("disabled prevents the filter input from being typed into", async () => {
		const user = userEvent.setup();
		render(<ControlledHarness disabled />);

		const input = screen.getByLabelText("Validators") as HTMLInputElement;
		expect(input.disabled).toBe(true);

		await user.type(input, "jane");
		expect(input.value).toBe("");
	});

	it("doesn't self-wrap in .dts-form-component -- that class's display:grid stacked this component's own children into overlapping, click-intercepting cells with no real grid parent here", () => {
		render(<ControlledHarness />);

		const root = screen.getByLabelText("Validators").closest("div");
		expect(root?.className).not.toContain("dts-form-component");
	});
});
