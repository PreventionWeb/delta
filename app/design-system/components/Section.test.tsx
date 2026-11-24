import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { Section } from "./Section";

// Node tier -- non-interactive render only, matching Button.test.tsx's own precedent.
describe("Section", () => {
	it("renders its title, children, and actions", () => {
		const html = renderToString(
			<Section title="Spatial footprint" actions={<button>Add</button>}>
				<p>Row table content</p>
			</Section>,
		);

		expect(html).toContain("Spatial footprint");
		expect(html).toMatch(/<button[^>]*>Add<\/button>/);
		expect(html).toContain("Row table content");
	});

	it("renders actions after children, not beside the caption in the header row", () => {
		const html = renderToString(
			<Section title="Spatial footprint" actions={<button>Add</button>}>
				<p>Row table content</p>
			</Section>,
		);

		const headerIndex = html.indexOf("content-repeater-caption");
		const childrenIndex = html.indexOf("Row table content");
		const actionsIndex = html.indexOf("content-repeater-actions");
		expect(headerIndex).toBeGreaterThanOrEqual(0);
		expect(childrenIndex).toBeGreaterThan(headerIndex);
		expect(actionsIndex).toBeGreaterThan(childrenIndex);
		// The action button itself must render inside the actions row, not the header row.
		const addButtonIndex = html.indexOf(">Add<");
		expect(addButtonIndex).toBeGreaterThan(actionsIndex);
	});

	it("renders legacy ContentRepeater's own grey-card chrome classes", () => {
		const html = renderToString(
			<Section title="Spatial footprint" actions={<button>Add</button>}>
				<p>Row table content</p>
			</Section>,
		);

		expect(html).toMatch(/class="content-repeater"/);
		expect(html).toMatch(/class="content-repeater-caption"/);
		expect(html).toMatch(/class="content-repeater-actions"/);
	});
});
