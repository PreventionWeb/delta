import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
	useDivisionBoundaryPreviews,
	type DivisionPreviewEntry,
} from "./useDivisionBoundaryPreviews";

// No renderHook precedent in this codebase -- a tiny harness component, matching this project's
// own convention (e.g. MultiSelectCombobox.dom.test.tsx's ControlledHarness).
function Harness({
	divisionIds,
	buildBoundaryUrl,
}: {
	divisionIds: readonly string[];
	buildBoundaryUrl: (id: string) => string;
}) {
	const previews = useDivisionBoundaryPreviews(divisionIds, buildBoundaryUrl);
	return (
		<ul aria-label="previews">
			{previews.map((p: DivisionPreviewEntry) => (
				<li key={p.id}>{p.name}</li>
			))}
		</ul>
	);
}

function previewUrl(id: string) {
	return `/api/geojson/${id}`;
}

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn());
});

describe("useDivisionBoundaryPreviews", () => {
	it("fetches each new division id's boundary and renders it once resolved", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ name: "Division One", geojson: { type: "Point" } }),
		} as Response);

		render(<Harness divisionIds={["div-1"]} buildBoundaryUrl={previewUrl} />);

		await waitFor(() => expect(screen.getByText("Division One")).toBeTruthy());
		expect(fetchMock).toHaveBeenCalledWith("/api/geojson/div-1");
	});

	it("returns the same array across re-renders until the ids or a fetched boundary change -- the Preview map rebuilds on a new one", async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => ({ name: "Division One", geojson: { type: "Point" } }),
		} as Response);
		const seen: (readonly DivisionPreviewEntry[])[] = [];
		function Recorder({ ids }: { ids: readonly string[] }) {
			seen.push(useDivisionBoundaryPreviews(ids, previewUrl));
			return null;
		}
		const ids = ["div-1"];
		const { rerender } = render(<Recorder ids={ids} />);
		await waitFor(() => expect(seen[seen.length - 1]).toHaveLength(1));
		const settled = seen[seen.length - 1];

		rerender(<Recorder ids={ids} />);

		expect(seen[seen.length - 1]).toBe(settled);
	});

	it("never double-fetches an id already in flight, even across a rerender with the same ids", async () => {
		const fetchMock = vi.mocked(fetch);
		// A ref object, not a bare `let` -- a `let` reassigned only inside the Promise executor
		// below isn't narrowed by TS at the later read site (control-flow analysis gap).
		const resolver: { current: (() => void) | null } = { current: null };
		fetchMock.mockImplementation(
			() =>
				new Promise<Response>((resolve) => {
					resolver.current = () =>
						resolve({
							ok: true,
							json: async () => ({ name: "Division One", geojson: {} }),
						} as Response);
				}),
		);

		const { rerender } = render(
			<Harness divisionIds={["div-1"]} buildBoundaryUrl={previewUrl} />,
		);
		rerender(<Harness divisionIds={["div-1"]} buildBoundaryUrl={previewUrl} />);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		resolver.current?.();
		await waitFor(() => expect(screen.getByText("Division One")).toBeTruthy());
	});

	it("discards a late-resolving fetch for an id already deselected, and re-fetches (not from a stale cache entry) if it's reselected", async () => {
		const fetchMock = vi.mocked(fetch);
		const resolver: { current: ((value: Response) => void) | null } = {
			current: null,
		};
		fetchMock.mockImplementationOnce(
			() => new Promise<Response>((resolve) => (resolver.current = resolve)),
		);

		const { rerender } = render(
			<Harness divisionIds={["div-1"]} buildBoundaryUrl={previewUrl} />,
		);
		rerender(<Harness divisionIds={[]} buildBoundaryUrl={previewUrl} />);

		// Resolve after deselection -- without the discard guard, this would populate
		// previewCache with a stale entry that'd render immediately on reselection below,
		// with no second fetch (the bug this test exists to catch).
		resolver.current?.({
			ok: true,
			json: async () => ({ name: "Division One", geojson: {} }),
		} as Response);
		await waitFor(() => expect(screen.queryByText("Division One")).toBeNull());

		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ name: "Division One", geojson: {} }),
		} as Response);
		rerender(<Harness divisionIds={["div-1"]} buildBoundaryUrl={previewUrl} />);

		expect(screen.queryByText("Division One")).toBeNull();
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(screen.getByText("Division One")).toBeTruthy());
	});

	it("a non-ok response is swallowed -- no crash, no preview entry added", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue({ ok: false } as Response);

		expect(() =>
			render(<Harness divisionIds={["div-1"]} buildBoundaryUrl={previewUrl} />),
		).not.toThrow();

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(screen.queryAllByRole("listitem")).toHaveLength(0);
	});

	it("a rejected fetch (network error) is swallowed -- no crash, no preview entry added", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockRejectedValue(new Error("network down"));

		expect(() =>
			render(<Harness divisionIds={["div-1"]} buildBoundaryUrl={previewUrl} />),
		).not.toThrow();

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(screen.queryAllByRole("listitem")).toHaveLength(0);
	});
});
