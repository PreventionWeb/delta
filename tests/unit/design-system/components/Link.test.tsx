import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { Link } from "~/design-system/components/Link";

function renderLink() {
	return renderToString(
		<MemoryRouter>
			<Link href="/en/he-preview/abc" aria-label="View">
				View
			</Link>
		</MemoryRouter>,
	);
}

describe("Link", () => {
	it("renders a real <a> element with its href, not a <span>", () => {
		const html = renderLink();

		expect(html).toMatch(/<a[^>]*href="\/en\/he-preview\/abc"/);
	});

	it("carries its own accessible label through to the rendered element", () => {
		const html = renderLink();

		expect(html).toContain('aria-label="View"');
	});
});
