import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { BackLink } from "./BackLink";

function render(href: string, label: string): string {
	return renderToString(
		<MemoryRouter>
			<BackLink href={href} label={label} />
		</MemoryRouter>,
	);
}

describe("BackLink", () => {
	it("renders an <a> with the given href and label as its visible text", () => {
		const html = render("/en/he-preview", "Back to Hazardous events");

		expect(html).toMatch(/<a[^>]*href="\/en\/he-preview"[^>]*>/);
		expect(html).toContain("Back to Hazardous events");
	});

	it("renders a leading aria-hidden svg before the label text", () => {
		const html = render("/en/he-preview", "Back to Hazardous events");

		const svgIndex = html.indexOf("<svg");
		const labelIndex = html.indexOf("Back to Hazardous events");
		expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
		expect(svgIndex).toBeGreaterThan(-1);
		expect(svgIndex).toBeLessThan(labelIndex);
	});

	// Legacy layout classes, with the accessible --color-dts-action colour (6b B1).
	it("carries design.md Decision 12's exact outlined-button class list", () => {
		const html = render("/en/he-preview", "Back to Hazardous events");
		const match = html.match(/<a[^>]*class="([^"]*)"/);
		expect(match).not.toBeNull();
		const className = match?.[1] ?? "";

		// Exhaustive, not just toContain-per-class, so a stray/duplicate class also fails (Decision 12: pixel-exact parity, not a superset).
		expect(className.split(" ").sort()).toEqual(
			[
				"inline-flex",
				"items-center",
				"gap-2",
				"rounded-[6px]",
				"border",
				"border-dts-action",
				"bg-transparent",
				"px-[1.09375rem]",
				"py-[0.65625rem]",
				"text-sm",
				"font-normal",
				"text-dts-action",
			].sort(),
		);
	});
});
