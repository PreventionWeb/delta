import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { ReviewField } from "./ReviewField";

describe("ReviewField", () => {
	it("renders a space-y-1 wrapper with the label and value in their own <p>, legacy's exact classes", () => {
		const html = renderToString(
			<ReviewField label="Record originator" value="Jane Doe" />,
		);

		expect(html).toBe(
			'<div class="space-y-1">' +
				'<p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Record originator</p>' +
				'<p class="text-[14px] leading-[18px] font-semibold text-slate-800">Jane Doe</p>' +
				"</div>",
		);
	});

	it("renders a non-string ReactNode value unchanged (e.g. an already-pilled value)", () => {
		const html = renderToString(
			<ReviewField
				label="Status"
				value={<span className="pill">Draft</span>}
			/>,
		);

		expect(html).toContain('<span class="pill">Draft</span>');
	});
});

describe("ReviewField preserveLineBreaks", () => {
	// The false/absent case is covered by the top describe block's first test (byte-identical) -- not duplicated here.

	it("swaps to legacy's whitespace-pre-line, non-bold styling when true", () => {
		const html = renderToString(
			<ReviewField label="Description" value="Line one" preserveLineBreaks />,
		);

		expect(html).toContain(
			'<p class="text-[14px] leading-relaxed text-slate-700 whitespace-pre-line">Line one</p>',
		);
	});

	it("preserves an embedded newline verbatim in the serialized output", () => {
		const html = renderToString(
			<ReviewField
				label="Description"
				value={"Line one\nLine two"}
				preserveLineBreaks
			/>,
		);

		// Proves "\n" survives serialization; whitespace-pre-line's visual effect is CSS, not observable via renderToString.
		expect(html).toContain("Line one\nLine two");
	});
});
