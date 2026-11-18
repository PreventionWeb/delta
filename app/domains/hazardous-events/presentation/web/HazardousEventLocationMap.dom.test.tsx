import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";
import { HazardousEventLocationMap } from "./HazardousEventLocationMap";

// Mocks ensureLeafletLoaded directly rather than touching the real global Leaflet script.
const removeMock = vi.fn();
const mapMock = {
	remove: removeMock,
	fitBounds: vi.fn(),
	setView: vi.fn(),
	invalidateSize: vi.fn(),
};
const layerMock = {
	addTo: vi.fn(),
	getBounds: vi.fn(() => ({ isValid: () => false })),
};
const fakeL = {
	map: vi.fn(() => mapMock),
	tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
	geoJSON: vi.fn(() => layerMock),
	latLngBounds: vi.fn(() => ({ isValid: () => false, extend: vi.fn() })),
};

let ensureLeafletLoadedResolution: unknown = fakeL;
vi.mock("./leafletLoader", () => ({
	ensureLeafletLoaded: () => Promise.resolve(ensureLeafletLoadedResolution),
}));

const geometries = [{ type: "Point", coordinates: [0, 0] }];

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.useRealTimers();
	ensureLeafletLoadedResolution = fakeL;
});

describe("HazardousEventLocationMap (dom)", () => {
	it("creates a Leaflet map against its own container once Leaflet resolves", async () => {
		render(
			<HazardousEventLocationMap geometries={geometries} aria-label="map" />,
		);

		await waitFor(() => expect(fakeL.map).toHaveBeenCalledTimes(1));
	});

	it("does not throw when ensureLeafletLoaded resolves null (CDN load failure)", async () => {
		ensureLeafletLoadedResolution = null;

		await act(async () => {
			render(
				<HazardousEventLocationMap geometries={geometries} aria-label="map" />,
			);
		});

		expect(fakeL.map).not.toHaveBeenCalled();
	});

	it("calls map.remove() exactly once on unmount", async () => {
		const { unmount } = render(
			<HazardousEventLocationMap geometries={geometries} aria-label="map" />,
		);

		await waitFor(() => expect(fakeL.map).toHaveBeenCalledTimes(1));
		unmount();

		expect(removeMock).toHaveBeenCalledTimes(1);
	});

	// An unmount racing the pending invalidateSize() timer must not call it on an already-removed map.
	it("does not call invalidateSize after unmount cancels the pending timer", async () => {
		vi.useFakeTimers();
		const { unmount } = render(
			<HazardousEventLocationMap geometries={geometries} aria-label="map" />,
		);

		await act(async () => {});
		unmount();
		vi.runAllTimers();

		expect(mapMock.invalidateSize).not.toHaveBeenCalled();
	});
});
