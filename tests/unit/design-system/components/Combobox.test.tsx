import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox } from "~/design-system/components/Combobox";

const SAMPLE_OPTIONS = [
	{ id: "abc", name: "Example Hazard" },
	{ id: "cyc", name: "Tropical Cyclone" },
	{ id: "eq", name: "Earthquake" },
	{ id: "fl", name: "Flood" },
];

describe("Combobox", () => {
	it("filters the option list case-insensitively as the user types", async () => {
		const user = userEvent.setup();
		render(
			<Combobox
				name="example"
				label="Specific hazard"
				options={SAMPLE_OPTIONS}
			/>,
		);

		const input = screen.getByRole("combobox", { name: /specific hazard/i });
		await user.click(input);
		await user.type(input, "cyclone");

		const options = await screen.findAllByRole("option");
		const optionTexts = options.map((o) => o.textContent);
		expect(optionTexts).toContain("Tropical Cyclone");
		expect(optionTexts).not.toContain("Earthquake");
	});

	it("caps the displayed option list at 20, even when more options match", async () => {
		const user = userEvent.setup();
		const manyOptions = Array.from({ length: 25 }, (_, i) => ({
			id: `hazard-${i}`,
			name: `Flood type ${i}`,
		}));
		render(
			<Combobox name="example" label="Specific hazard" options={manyOptions} />,
		);

		const input = screen.getByRole("combobox", { name: /specific hazard/i });
		await user.click(input);
		await user.type(input, "flood");

		const options = await screen.findAllByRole("option");
		expect(options.length).toBe(20);
	});

	it("does not submit unselected free text", async () => {
		const user = userEvent.setup();
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
				<Combobox
					name="example"
					label="Specific hazard"
					options={SAMPLE_OPTIONS}
				/>
				<button type="submit">Go</button>
			</form>,
		);

		const input = screen.getByRole("combobox", { name: /specific hazard/i });
		await user.click(input);
		await user.type(input, "nonexistent free text");

		const hiddenInput = container.querySelector(
			'input[type="hidden"][name="example"]',
		) as HTMLInputElement | null;
		expect(hiddenInput).not.toBeNull();
		expect(hiddenInput?.value).toBe("");

		// Submit while free text is still present, not after Escape, which would revert it.
		expect((input as HTMLInputElement).value).toBe("nonexistent free text");
		fireEvent.submit(container.querySelector("form") as HTMLFormElement);

		expect(submitted?.getAll("example")).toEqual([""]);
	});

	it("submits the selected option's id, not its display name", async () => {
		const user = userEvent.setup();
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
				<Combobox
					name="example"
					label="Specific hazard"
					options={SAMPLE_OPTIONS}
				/>
				<button type="submit">Go</button>
			</form>,
		);

		const input = screen.getByRole("combobox", { name: /specific hazard/i });
		await user.click(input);
		await user.type(input, "Example");

		const option = await screen.findByRole("option", {
			name: /Example Hazard/i,
		});
		await user.click(option);

		const hiddenInput = container.querySelector(
			'input[type="hidden"][name="example"]',
		) as HTMLInputElement;
		expect(hiddenInput.value).toBe("abc");

		await user.click(screen.getByRole("button", { name: "Go" }));

		expect(submitted?.getAll("example")).toEqual(["abc"]);
	});

	it("is reachable via Tab and operable via arrow keys/Enter/Escape", async () => {
		const user = userEvent.setup();
		const { container } = render(
			<Combobox
				name="example"
				label="Specific hazard"
				options={SAMPLE_OPTIONS}
			/>,
		);

		await user.tab();
		const input = screen.getByRole("combobox", { name: /specific hazard/i });
		expect(document.activeElement).toBe(input);

		await user.keyboard("Example");
		await user.keyboard("{ArrowDown}");
		await user.keyboard("{Enter}");

		const hiddenInput = container.querySelector(
			'input[type="hidden"][name="example"]',
		) as HTMLInputElement;
		expect(hiddenInput.value).toBe("abc");

		// Reopen (filtered by the already-selected text, which still matches its own option),
		// then Escape closes the dropdown without altering the already-made selection.
		await user.keyboard("{ArrowDown}");
		await screen.findByRole("listbox");
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("listbox")).toBeNull();
		expect(hiddenInput.value).toBe("abc");
	});

	// Regression (Gate 9 live-browser finding, not caught by jsdom since every test above types a
	// multi-char string): RAC's own open-on-type heuristic doesn't open on the very first
	// keystroke into an empty field.
	it("opens the dropdown on a single-character first keystroke", async () => {
		const user = userEvent.setup();
		render(
			<Combobox
				name="example"
				label="Specific hazard"
				options={SAMPLE_OPTIONS}
			/>,
		);

		const input = screen.getByRole("combobox", { name: /specific hazard/i });
		await user.click(input);
		await user.type(input, "e");

		const options = await screen.findAllByRole("option");
		const optionTexts = options.map((o) => o.textContent);
		expect(optionTexts).toContain("Example Hazard");
		expect(optionTexts).toContain("Earthquake");
	});
});
