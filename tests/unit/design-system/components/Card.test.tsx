import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Card } from "~/design-system/components/Card";

describe("Card", () => {
	it("renders a plain header with no wrapper or icon when icon is not given", () => {
		const html = renderToStaticMarkup(
			<Card title="Basic information">
				<p>content</p>
			</Card>,
		);

		expect(html).toMatch(/<h2[^>]*>Basic information<\/h2>/);
		expect(html).not.toContain("<i");
		expect(html).not.toContain("flex items-center gap-2 text-slate-800");
	});

	it("renders legacy's icon wrapper before the title when icon is given, defaulting titleSize to lg", () => {
		const html = renderToStaticMarkup(
			<Card title="Basic information" icon="pi-info-circle">
				<p>content</p>
			</Card>,
		);

		expect(html).toMatch(
			/<div class="flex items-center gap-2 text-slate-800 mb-4"><i class="pi pi-info-circle text-blue-600" aria-hidden="true"><\/i><h2[^>]*class="text-\[18px\] leading-\[24px\] font-semibold"[^>]*>Basic information<\/h2><\/div>/,
		);
	});

	// design.md Decision 15, Fix 1, Part A: legacy's own tighter title-size group.
	it("renders titleSize='sm' at legacy's tighter size, with the matching mb-6 header-gap", () => {
		const html = renderToStaticMarkup(
			<Card title="Basic information" icon="pi-info-circle" titleSize="sm">
				<p>content</p>
			</Card>,
		);

		expect(html).toMatch(
			/<div class="flex items-center gap-2 text-slate-800 mb-6">/,
		);
		expect(html).toMatch(
			/<h2[^>]*class="text-\[16px\] leading-\[16px\] font-semibold"[^>]*>Basic information<\/h2>/,
		);
	});

	// design.md Decision 15, Fix 1, Part A: legacy's other title-size group, explicit.
	it("renders titleSize='lg' at legacy's other size, with the matching mb-4 header-gap", () => {
		const html = renderToStaticMarkup(
			<Card title="Basic information" icon="pi-info-circle" titleSize="lg">
				<p>content</p>
			</Card>,
		);

		expect(html).toMatch(
			/<div class="flex items-center gap-2 text-slate-800 mb-4">/,
		);
		expect(html).toMatch(
			/<h2[^>]*class="text-\[18px\] leading-\[24px\] font-semibold"[^>]*>Basic information<\/h2>/,
		);
	});

	// design.md Decision 15, Fix 2: legacy's own PrimeReact box-shadow, reproduced literally
	// since CA's plain <section> has no PrimeReact theme CSS to fall back on.
	it("renders a visible box-shadow, not legacy's vestigial shadow-none", () => {
		const html = renderToStaticMarkup(
			<Card title="Basic information">
				<p>content</p>
			</Card>,
		);

		expect(html).toContain(
			"shadow-[0_2px_1px_-1px_rgba(0,0,0,0.2),0_1px_1px_0_rgba(0,0,0,0.14),0_1px_3px_0_rgba(0,0,0,0.12)]",
		);
		expect(html).not.toContain("shadow-none");
	});

	// design.md Decision 16, Fix 1: a root margin here would stack/collapse against the page's space-y-6.
	it("renders the root section with no mb-4 of its own (Card-to-Card spacing owned by the page)", () => {
		const html = renderToStaticMarkup(
			<Card title="Basic information" icon="pi-info-circle">
				<p>content</p>
			</Card>,
		);

		const sectionTag = html.slice(0, html.indexOf(">") + 1);
		expect(sectionTag.startsWith("<section")).toBe(true);
		expect(sectionTag).not.toContain("mb-4");
	});

	// design.md Decision 16, Fix 2, corrected by the 6g correction: legacy's real stacked
	// vertical total (.p-card-body + .p-card-content) is ~36px, not .p-card-body's 18px alone.
	it("renders the root section with legacy's literal asymmetric padding, not the uniform p-5", () => {
		const html = renderToStaticMarkup(
			<Card title="Basic information">
				<p>content</p>
			</Card>,
		);

		const sectionTag = html.slice(0, html.indexOf(">") + 1);
		expect(sectionTag).toContain("px-[20px]");
		expect(sectionTag).toContain("py-[36px]");
		expect(sectionTag).not.toContain("p-5");
	});
});
