import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectParentEvent } from "./HazardousEventPickerPage";

describe("selectParentEvent (design.md Decision 13)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("posts { selected } to window.opener (same shape hazardeventform.tsx:422-432 listens for), then closes the picker window after a short delay", () => {
		const postMessage = vi.fn();
		vi.stubGlobal("opener", { postMessage });
		const closeSpy = vi.spyOn(window, "close").mockImplementation(() => {});

		selectParentEvent({
			id: "event-1",
			specificHazardName: "Flood",
		} as Parameters<typeof selectParentEvent>[0]);

		expect(postMessage).toHaveBeenCalledWith(
			{ selected: { id: "event-1", specificHazardName: "Flood" } },
			window.location.origin,
		);
		// Deferred, not immediate -- close() must not have happened synchronously (a real
		// `window.close()` racing the message dispatch is the bug this delay avoids).
		expect(closeSpy).not.toHaveBeenCalled();

		vi.runAllTimers();

		expect(closeSpy).toHaveBeenCalledOnce();
	});

	it("still closes the window when there is no opener", () => {
		vi.stubGlobal("opener", null);
		const closeSpy = vi.spyOn(window, "close").mockImplementation(() => {});

		expect(() =>
			selectParentEvent({
				id: "event-2",
				specificHazardName: null,
			} as Parameters<typeof selectParentEvent>[0]),
		).not.toThrow();

		vi.runAllTimers();

		expect(closeSpy).toHaveBeenCalledOnce();
	});
});
