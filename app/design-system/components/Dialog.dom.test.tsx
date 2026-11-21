import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Dialog } from "./Dialog";

afterEach(() => {
	cleanup();
});

// jsdom tier (vitest.config.ts's "dom" project, *.dom.test.tsx naming convention) -- real
// interaction needs a real DOM, unlike the renderToString-only Dialog.test.tsx sibling.
function renderDialog(onOpenChange: (open: boolean) => void) {
	return render(
		<Dialog
			isOpen
			title="Discard changes"
			closeLabel="Close"
			onOpenChange={onOpenChange}
		>
			<p>Body content</p>
		</Dialog>,
	);
}

describe("Dialog (jsdom interaction)", () => {
	it("calls onOpenChange(false) when Escape is pressed while open", () => {
		const onOpenChange = vi.fn();
		renderDialog(onOpenChange);

		fireEvent.keyDown(screen.getByRole("dialog"), {
			key: "Escape",
			code: "Escape",
		});

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("calls onOpenChange(false) when the overlay outside the dialog panel is clicked", () => {
		const onOpenChange = vi.fn();
		const { baseElement } = renderDialog(onOpenChange);

		const overlay = baseElement.querySelector(".dts-dialog-overlay");
		expect(overlay).not.toBeNull();

		// RAC's dismiss-on-outside-click needs pointerdown then click (jsdom defines
		// PointerEvent) -- a lone "click" never sets its internal isPointerDown flag.
		fireEvent.pointerDown(overlay as Element);
		fireEvent.click(overlay as Element);

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("renders a header close-icon button whose accessible name matches closeLabel, and activating it closes the dialog", () => {
		const onOpenChange = vi.fn();
		renderDialog(onOpenChange);

		const closeButton = screen.getByRole("button", { name: "Close" });
		fireEvent.click(closeButton);

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});

describe("Dialog dismissDisabled", () => {
	it("dismissDisabled suppresses Escape-to-close, but outside-click dismissal still works", () => {
		const onOpenChange = vi.fn();
		const { baseElement } = render(
			<Dialog
				isOpen
				title="Draw a shape"
				closeLabel="Close"
				dismissDisabled
				onOpenChange={onOpenChange}
			>
				<p>Map</p>
			</Dialog>,
		);

		fireEvent.keyDown(screen.getByRole("dialog"), {
			key: "Escape",
			code: "Escape",
		});
		expect(onOpenChange).not.toHaveBeenCalled();

		const overlay = baseElement.querySelector(".dts-dialog-overlay");
		fireEvent.pointerDown(overlay as Element);
		fireEvent.click(overlay as Element);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("omitting dismissDisabled keeps Escape-to-close working as before", () => {
		const onOpenChange = vi.fn();
		renderDialog(onOpenChange);

		fireEvent.keyDown(screen.getByRole("dialog"), {
			key: "Escape",
			code: "Escape",
		});

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});

describe('Dialog variant="item"', () => {
	it("renders a fixed-width Tailwind panel (not dts-dialog-panel) with title, footer, and a working close button", () => {
		const onOpenChange = vi.fn();
		const { baseElement } = render(
			<Dialog
				isOpen
				variant="item"
				title="Add new item"
				closeLabel="Close"
				onOpenChange={onOpenChange}
				footer={<button type="button">Apply</button>}
			>
				<p>Fields</p>
			</Dialog>,
		);

		expect(baseElement.querySelector(".dts-dialog-panel")).toBeNull();
		const panel = screen.getByRole("dialog").parentElement;
		// Viewport-relative width, not content-fit -- legacy's min(92vw, 72rem).
		expect(panel?.className).toContain("w-11/12");
		expect(panel?.className).toContain("max-w-6xl");
		expect(screen.getByRole("heading", { name: "Add new item" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Apply" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it('size="medium" narrows the panel to legacy\'s 64rem tree dialog', () => {
		render(
			<Dialog
				isOpen
				variant="item"
				size="medium"
				title="Select geographic level"
				closeLabel="Close"
				onOpenChange={vi.fn()}
			>
				<p>Tree</p>
			</Dialog>,
		);

		const panel = screen.getByRole("dialog").parentElement;
		expect(panel?.className).toContain("max-w-5xl");
		expect(panel?.className).not.toContain("max-w-6xl");
	});
});

describe('Dialog variant="fullscreen"', () => {
	it("covers the viewport with legacy's own header/title/close classes, and closes via its close button", () => {
		const onOpenChange = vi.fn();
		render(
			<Dialog
				isOpen
				variant="fullscreen"
				title="Mapper"
				closeLabel="Close"
				onOpenChange={onOpenChange}
			>
				<p>Map</p>
			</Dialog>,
		);

		const panel = screen.getByRole("dialog").parentElement;
		expect(panel?.className).toContain("inset-0");
		const heading = screen.getByRole("heading", { name: "Mapper" });
		expect(heading.className).toContain("dts-heading-2");
		const close = screen.getByRole("button", { name: "Close" });
		expect(close.className).toContain("dts-dialog-close-button");

		fireEvent.click(close);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
