import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { Button } from "./Button";

// Node tier -- non-interactive render only (matches Card.tsx's own test-friendly simplicity).
// This is the design-system component family's first test file (design.md Decision 12).
describe("Button", () => {
	it('variant="primary" renders a real <button> with the shared base class and the primary variant class', () => {
		const html = renderToString(<Button variant="primary">Save</Button>);

		expect(html).toMatch(/<button\b/);
		expect(html).toMatch(/<button[^>]*\bclass="[^"]*\bdts-button\b[^"]*"/);
		expect(html).toMatch(
			/<button[^>]*\bclass="[^"]*\bdts-button--primary\b[^"]*"/,
		);
	});

	it('variant="outline" renders a <button> with the outline variant class', () => {
		const html = renderToString(<Button variant="outline">Cancel</Button>);

		expect(html).toMatch(/<button\b/);
		expect(html).toMatch(
			/<button[^>]*\bclass="[^"]*\bdts-button--outline\b[^"]*"/,
		);
	});

	it('variant="system" reuses legacy\'s mg-button-system classes, not dts-button', () => {
		const html = renderToString(<Button variant="system">Add</Button>);

		expect(html).toMatch(/<button[^>]*\bclass="mg-button mg-button-system"/);
		expect(html).not.toMatch(/dts-button/);
	});

	it('variant="icon" renders a bare <button> carrying its aria-label', () => {
		const html = renderToString(
			<Button variant="icon" aria-label="Delete row">
				<i className="pi pi-trash" aria-hidden="true" />
			</Button>,
		);

		expect(html).toMatch(/<button[^>]*\baria-label="Delete row"/);
		expect(html).not.toMatch(/dts-button|mg-button/);
	});

	it.each(["accent", "accent-outline", "muted-outline"] as const)(
		"variant=%s uses Tailwind utilities only -- no dts-button, mg-button, or PrimeReact class",
		(variant) => {
			const html = renderToString(<Button variant={variant}>Apply</Button>);

			expect(html).toMatch(/<button[^>]*class="[^"]*rounded-md/);
			expect(html).not.toMatch(/dts-button|mg-button|p-button/);
		},
	);

	it('variant="system-primary" reuses the legacy mg-button-primary classes', () => {
		const html = renderToString(
			<Button variant="system-primary">Save Coordinates</Button>,
		);

		expect(html).toMatch(/<button[^>]*class="mg-button mg-button-primary"/);
	});

	it("disabled renders a real <button disabled> element", () => {
		const html = renderToString(
			<Button variant="primary" disabled>
				Save
			</Button>,
		);

		expect(html).toMatch(/<button\b/);
		expect(html).toMatch(/<button[^>]*\bdisabled\b/);
	});
});
