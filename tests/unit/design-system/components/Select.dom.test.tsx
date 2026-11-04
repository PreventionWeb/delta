import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select } from "~/design-system/components/Select";

const SAMPLE_OPTIONS = [
	{ id: "draft", name: "Draft" },
	{ id: "submitted", name: "Waiting for validation" },
	{ id: "published", name: "Published" },
];

describe("Select", () => {
	it("submits its value as a named form field", async () => {
		const user = userEvent.setup();
		let submitted: URLSearchParams | undefined;
		render(
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
				<Select name="example" label="Record status" options={SAMPLE_OPTIONS} />
				<button type="submit">Go</button>
			</form>,
		);

		await user.click(screen.getByRole("button", { name: /record status/i }));
		await user.click(
			await screen.findByRole("option", { name: "Waiting for validation" }),
		);
		await user.click(screen.getByRole("button", { name: "Go" }));

		expect(submitted?.get("example")).toBe("submitted");
	});

	it("is reachable and operable via keyboard alone", async () => {
		const user = userEvent.setup();
		render(
			<Select name="example" label="Record status" options={SAMPLE_OPTIONS} />,
		);

		await user.tab();
		const trigger = screen.getByRole("button", { name: /record status/i });
		expect(document.activeElement).toBe(trigger);
		expect(trigger.textContent ?? "").not.toContain("Waiting for validation");

		await user.keyboard("{Enter}");
		await screen.findByRole("listbox");
		await user.keyboard("{ArrowDown}");
		await user.keyboard("{Enter}");

		// Opening with Enter focuses the first option, so ArrowDown+Enter lands on the second
		// ("Waiting for validation") -- confirms keyboard-only selection actually took effect.
		expect(trigger.textContent ?? "").toContain("Waiting for validation");
	});

	// React Aria restores focus to the trigger asynchronously (one tick after the click settles),
	// so a mouse-click selection needs waitFor, not a synchronous assertion.
	it("restores focus to the trigger after a mouse-click selection", async () => {
		const user = userEvent.setup();
		render(
			<Select name="example" label="Record status" options={SAMPLE_OPTIONS} />,
		);
		const trigger = screen.getByRole("button", { name: /record status/i });
		await user.click(trigger);
		await screen.findByRole("listbox");
		await user.click(
			screen.getByRole("option", { name: "Waiting for validation" }),
		);

		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});
});
