import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { Dialog } from "./Dialog";

// RAC's ModalOverlay always renders null during SSR (useIsSSR()), so title/content checks live
// in Dialog.dom.test.tsx instead; this just confirms SSR never crashes or leaks dialog content.
describe("Dialog (non-interactive render)", () => {
	it("renders without crashing during SSR, with no dialog content in the server HTML", () => {
		const html = renderToString(
			<Dialog
				isOpen
				title="Discard changes"
				closeLabel="Close"
				onOpenChange={() => {}}
			>
				<p>Save this record as a draft, or discard your changes and exit.</p>
			</Dialog>,
		);

		expect(html).not.toContain("Discard changes");
	});
});
