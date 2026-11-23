import { describe, it, expect, afterEach, vi } from "vitest";
import {
	render,
	screen,
	fireEvent,
	cleanup,
	act,
} from "@testing-library/react";
import { ToastRegion, createToastQueue } from "./Toast";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function renderRegion() {
	const queue = createToastQueue();
	render(<ToastRegion queue={queue} closeLabel="Close" />);
	return queue;
}

describe("Toast (jsdom)", () => {
	it("renders nothing until a toast is added", () => {
		renderRegion();

		expect(screen.queryByRole("region")).toBeNull();
	});

	it("renders an error toast's message with error semantics", () => {
		const queue = renderRegion();

		act(() => {
			queue.add({ variant: "error", message: "Cannot delete" });
		});

		const toast = screen.getByRole("alertdialog");
		expect(toast.getAttribute("data-variant")).toBe("error");
		expect(toast.textContent).toContain("Cannot delete");
		expect(toast.className).toContain("text-red-500");
	});

	it("renders an info toast with info semantics, distinct from error", () => {
		const queue = renderRegion();

		act(() => {
			queue.add({ variant: "info", message: "Record deleted" });
		});

		const toast = screen.getByRole("alertdialog");
		expect(toast.getAttribute("data-variant")).toBe("info");
		expect(toast.className).toContain("text-blue-500");
		expect(toast.className).not.toContain("text-red-500");
	});

	it("announces the message through a live region (role=alert)", () => {
		const queue = renderRegion();

		act(() => {
			queue.add({ variant: "error", message: "Cannot delete" });
		});

		expect(screen.getByRole("alert").textContent).toContain("Cannot delete");
		expect(screen.getByRole("region")).toBeTruthy();
	});

	it("positions the region at the top-center of the viewport", () => {
		const queue = renderRegion();

		act(() => {
			queue.add({ variant: "error", message: "Cannot delete" });
		});

		const region = screen.getByRole("region");
		expect(region.className).toContain("fixed");
		expect(region.className).toContain("top-5");
		expect(region.className).toContain("items-center");
	});

	it("auto-dismisses after its configured timeout", () => {
		vi.useFakeTimers();
		const queue = renderRegion();

		act(() => {
			queue.add(
				{ variant: "error", message: "Cannot delete" },
				{ timeout: 5000 },
			);
		});
		expect(screen.getByRole("alertdialog")).toBeTruthy();

		act(() => {
			vi.advanceTimersByTime(4999);
		});
		expect(screen.queryByRole("alertdialog")).not.toBeNull();

		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	it("can be dismissed manually through its close button", () => {
		const queue = renderRegion();

		act(() => {
			queue.add({ variant: "error", message: "Cannot delete" });
		});
		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	it("renders no PrimeReact/PrimeIcons classes", () => {
		const queue = renderRegion();

		act(() => {
			queue.add({ variant: "error", message: "Cannot delete" });
		});

		expect(document.body.innerHTML).not.toMatch(/\bp-toast|\bpi\b|\bpi-/);
	});
});
