import {
	describe,
	it,
	expect,
	vi,
	beforeAll,
	beforeEach,
	afterEach,
	type Mock,
} from "vitest";
import { StrictMode } from "react";
import {
	render,
	screen,
	fireEvent,
	waitFor,
	cleanup,
	act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import {
	checkShapeAgainstDivisions,
	convertCircleToTurfPolygon,
} from "~/utils/spatialUtils";

// Fake Leaflet + leaflet-draw namespace, hoisted for the vi.mock("./leafletLoader") factory below.
// Contract: component must register via map.on(L.Draw.Event.CREATED/EDITED/..., handler) on the
// same map instance from L.map(...) -- tests grab those handlers via map._handlers and invoke them.
// EDITED fires leaflet-draw's real `{ layers: { eachLayer(cb) } }` shape, not a single `layer`.
type EventHandler = (event: unknown) => void;

interface FakeMap {
	on: Mock<(event: string, handler: EventHandler) => void>;
	addLayer: Mock;
	remove: Mock;
	setView: Mock;
	fitBounds: Mock;
	invalidateSize: Mock;
	_handlers: Record<string, EventHandler>;
}

interface FakeLayer {
	addTo: Mock;
	getBounds?: Mock;
}

interface FakeGeoJsonGroup extends FakeLayer {
	getLayers: Mock<() => FakeLayer[]>;
}

interface FakeDrawTool {
	kind: string;
	enable: Mock;
	disable: Mock;
	deleteLastVertex?: Mock;
}

const {
	fakeL,
	fakeMapInstances,
	featureGroupInstances,
	drawHandlerInstances,
	editHandlerInstances,
	loaderState,
} = vi.hoisted(() => {
	const fakeMapInstances: FakeMap[] = [];

	function createFakeMap(): FakeMap {
		const handlers: Record<string, EventHandler> = {};
		const map: FakeMap = {
			on: vi.fn((event: string, handler: EventHandler) => {
				handlers[event] = handler;
			}),
			addLayer: vi.fn(),
			remove: vi.fn(),
			setView: vi.fn(),
			fitBounds: vi.fn(),
			invalidateSize: vi.fn(),
			_handlers: handlers,
		};
		fakeMapInstances.push(map);
		return map;
	}

	const featureGroupInstances: FakeFeatureGroup[] = [];
	// Stands in for L.FeatureGroup; each `new` call is tracked so tests can tell the persisted
	// shapes group apart from the non-persisted division-preview group.
	class FakeFeatureGroup {
		layers: unknown[] = [];
		addLayer(layer: unknown) {
			this.layers.push(layer);
		}
		removeLayer(layer: unknown) {
			this.layers = this.layers.filter((l) => l !== layer);
		}
		clearLayers() {
			this.layers = [];
		}
		addTo() {
			return this;
		}
		getBounds() {
			return { isValid: () => this.layers.length > 0, extend: vi.fn() };
		}
		constructor() {
			featureGroupInstances.push(this);
		}
	}

	// Stand-ins for L.Draw.<Tool> -- one class per tool so tests can tell which one the mode
	// dropdown started; every instance is tracked.
	const drawHandlerInstances: FakeDrawTool[] = [];
	function fakeDrawTool(kind: string) {
		return class {
			kind = kind;
			enable = vi.fn();
			disable = vi.fn();
			deleteLastVertex =
				kind === "Polygon" || kind === "Polyline" ? vi.fn() : undefined;
			constructor(
				public map?: unknown,
				public options?: unknown,
			) {
				drawHandlerInstances.push(this);
			}
		};
	}

	// Stand-in for L.EditToolbar.Edit -- save() fires EDITED synchronously for every layer in
	// the group (the real one fires only moved layers; the same with one shape per item).
	const editHandlerInstances: FakeEditHandler[] = [];
	class FakeEditHandler {
		enable = vi.fn();
		disable = vi.fn();
		save = vi.fn(() => {
			const group = this.options.featureGroup;
			this.map._handlers["draw:edited"]?.({
				layers: {
					eachLayer: (cb: (l: unknown) => void) => group.layers.forEach(cb),
				},
			});
		});
		constructor(
			public map: FakeMap,
			public options: { featureGroup: FakeFeatureGroup },
		) {
			editHandlerInstances.push(this);
		}
	}

	function fakeBounds() {
		return { isValid: () => true, extend: vi.fn() };
	}

	const fakeL = {
		map: vi.fn(() => createFakeMap()),
		tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
		// The inner layer is a distinct object from the wrapper group itself -- real
		// L.geoJSON() behavior for a single bare Geometry, needed so the prefill-then-delete
		// test can tell "stored the wrapper" apart from "stored the real inner child".
		geoJSON: vi.fn<(data: unknown) => FakeGeoJsonGroup>(() => {
			const innerLayer: FakeLayer = {
				addTo: vi.fn().mockReturnThis(),
				getBounds: vi.fn(fakeBounds),
			};
			return {
				addTo: vi.fn().mockReturnThis(),
				getBounds: vi.fn(fakeBounds),
				getLayers: vi.fn(() => [innerLayer]),
			};
		}),
		// Stateful, unlike a static stub -- extend() must flip isValid() so the default-view
		// fallback (setView vs. fitBounds) is actually distinguishable by test.
		latLngBounds: vi.fn(() => {
			let extended = false;
			return {
				isValid: () => extended,
				extend: vi.fn(() => {
					extended = true;
				}),
			};
		}),
		FeatureGroup: FakeFeatureGroup,
		EditToolbar: { Edit: FakeEditHandler },
		Draw: {
			Event: {
				CREATED: "draw:created",
				EDITED: "draw:edited",
				DRAWSTART: "draw:drawstart",
				DRAWSTOP: "draw:drawstop",
			},
			Polygon: fakeDrawTool("Polygon"),
			Marker: fakeDrawTool("Marker"),
			Polyline: fakeDrawTool("Polyline"),
			Rectangle: fakeDrawTool("Rectangle"),
			Circle: fakeDrawTool("Circle"),
		},
	};

	const loaderState: { leaflet: unknown; draw: unknown } = {
		leaflet: fakeL,
		draw: fakeL,
	};

	return {
		fakeL,
		fakeMapInstances,
		featureGroupInstances,
		drawHandlerInstances,
		editHandlerInstances,
		loaderState,
	};
});

vi.mock("./leafletLoader", () => ({
	ensureLeafletLoaded: vi.fn(() => Promise.resolve(loaderState.leaflet)),
	ensureLeafletDrawLoaded: vi.fn(() => Promise.resolve(loaderState.draw)),
}));

import { HazardousEventSpatialFootprintMap } from "./HazardousEventSpatialFootprintMap";
import { HazardousEventSpatialFootprintMapDialog } from "./HazardousEventSpatialFootprintMapDialog";

// Own i18n fixture, not imported from the real locale file -- these names are this test's
// contract, changeable together with this file.
const hazardousEvents = {
	form: {
		close: "Close",
		spatial_footprint: {
			map_dialog: { title: "Mapper" },
		},
		fields: {
			spatial_footprint_map: {
				unavailable: "Map unavailable. Try again later.",
				degenerate_shape:
					"Shape not added: it needs more points to form a valid shape.",
				search_label: "Search for a location",
				search_empty_prompt: "Enter a location to search.",
				search_not_found: "No location found for that search.",
				outside_division_confirm: "Add anyway",
				outside_division_cancel: "Discard shape",
				search_placeholder: "Type location and enter to search",
				mode_label: "Drawing mode",
				mode_move: "Move map",
				mode_polygon: "Polygon",
				mode_polyline: "Line",
				mode_rectangle: "Rectangle",
				mode_circle: "Circle",
				mode_marker: "Marker",
				mode_edit: "Edit shape",
				clear: "Clear",
				undo: "Undo",
				save: "Save Coordinates",
				replace_title: "Replace current shape?",
				replace_text: "Drawing a new shape will clear the current one.",
				replace_confirm: "Proceed",
				replace_cancel: "Keep current shape",
			},
		},
	},
	detail: { spatial_observation: { map_label: "Spatial footprint map" } },
};

let testI18n: I18n;

beforeAll(async () => {
	testI18n = i18n.createInstance();
	await testI18n.use(initReactI18next).init({
		lng: "en",
		fallbackLng: "en",
		ns: ["hazardous-events"],
		defaultNS: "hazardous-events",
		resources: { en: { "hazardous-events": hazardousEvents } },
	});
});

beforeEach(() => {
	vi.clearAllMocks();
	fakeMapInstances.length = 0;
	featureGroupInstances.length = 0;
	drawHandlerInstances.length = 0;
	editHandlerInstances.length = 0;
	loaderState.leaflet = fakeL;
	loaderState.draw = fakeL;
	global.fetch = vi.fn();
});

afterEach(() => {
	cleanup();
});

function latestMap() {
	return fakeMapInstances[fakeMapInstances.length - 1];
}

interface RenderProps {
	geometries?: readonly unknown[];
	previewDivisions?: readonly { id: string; name: string; geojson: unknown }[];
	onDrawActiveChange?: (active: boolean) => void;
	onSave?: (geometries: readonly unknown[]) => void;
}

function renderMap(props: RenderProps = {}) {
	const onSave =
		props.onSave ?? vi.fn<(geometries: readonly unknown[]) => void>();

	function Wrapper(p: RenderProps) {
		return (
			<I18nextProvider i18n={testI18n}>
				<HazardousEventSpatialFootprintMap
					geometries={p.geometries ?? []}
					previewDivisions={p.previewDivisions ?? []}
					onDrawActiveChange={p.onDrawActiveChange}
					onSave={onSave}
					aria-label="Spatial footprint map"
				/>
			</I18nextProvider>
		);
	}

	const utils = render(<Wrapper {...props} />);

	return {
		...utils,
		onSave,
		rerenderWith(next: RenderProps) {
			utils.rerender(
				<Wrapper
					geometries={next.geometries ?? props.geometries ?? []}
					previewDivisions={
						next.previewDivisions ?? props.previewDivisions ?? []
					}
					onDrawActiveChange={
						next.onDrawActiveChange ?? props.onDrawActiveChange
					}
				/>,
			);
		},
	};
}

// The map's committed shapes are observable only through Save Coordinates' onSave.
async function pressSave() {
	const button = screen.getByRole("button", {
		name: "Save Coordinates",
	}) as HTMLButtonElement;
	await waitFor(() => expect(button.disabled).toBe(false));
	fireEvent.click(button);
}

function editOption() {
	return screen.getByRole("option", {
		name: "Edit shape",
		hidden: true,
	}) as HTMLOptionElement;
}

const POLYGON_GEOMETRY = {
	type: "Polygon",
	coordinates: [
		[
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 0],
		],
	],
};

function fakePolygonLayer(geometry: unknown) {
	return {
		toGeoJSON: () => ({ type: "Feature", geometry, properties: {} }),
	};
}

describe("HazardousEventSpatialFootprintMap draw completion", () => {
	it("completing a polygon draw appends its bare Polygon geometry, unwrapped, with no Feature wrapper or title", async () => {
		const { onSave } = renderMap();

		await waitFor(() => expect(fakeMapInstances.length).toBeGreaterThan(0));
		const map = latestMap();
		const createdHandler = map._handlers[fakeL.Draw.Event.CREATED];
		expect(typeof createdHandler).toBe("function");

		createdHandler({
			layerType: "polygon",
			layer: fakePolygonLayer(POLYGON_GEOMETRY),
		});

		await pressSave();
		expect(onSave).toHaveBeenCalledWith([POLYGON_GEOMETRY]);
	});

	it("completing a circle draw converts it to a real Polygon via convertCircleToTurfPolygon, not the degenerate Point toGeoJSON() would give", async () => {
		const { onSave } = renderMap();

		await waitFor(() => expect(fakeMapInstances.length).toBeGreaterThan(0));
		const map = latestMap();
		const createdHandler = map._handlers[fakeL.Draw.Event.CREATED];

		const center = { lat: 10, lng: 20 };
		const radius = 500;
		const circleLayer = {
			getLatLng: () => center,
			getRadius: () => radius,
			toGeoJSON: () => ({
				type: "Feature",
				geometry: { type: "Point", coordinates: [center.lng, center.lat] },
				properties: {},
			}),
		};

		createdHandler({ layerType: "circle", layer: circleLayer });

		const expectedGeometry = convertCircleToTurfPolygon(
			center,
			radius,
		).geometry;

		await pressSave();
		expect(onSave).toHaveBeenCalledWith([expectedGeometry]);
	});

	it("a degenerate polygon (fewer than 3 distinct points) is not added to geometries, and a non-blocking message is shown", async () => {
		const { onSave } = renderMap();

		await waitFor(() => expect(fakeMapInstances.length).toBeGreaterThan(0));
		const map = latestMap();
		const createdHandler = map._handlers[fakeL.Draw.Event.CREATED];

		// Ring of 3 positions but only 2 distinct points -- (0,0) is both the start and the
		// closing point, (1,1) is the only other vertex. Too few points to form a real shape.
		const degenerateGeometry = {
			type: "Polygon",
			coordinates: [
				[
					[0, 0],
					[1, 1],
					[0, 0],
				],
			],
		};

		createdHandler({
			layerType: "polygon",
			layer: fakePolygonLayer(degenerateGeometry),
		});

		await waitFor(() =>
			expect(
				screen.getByText(
					hazardousEvents.form.fields.spatial_footprint_map.degenerate_shape,
				),
			).toBeTruthy(),
		);
		await pressSave();
		expect(onSave).toHaveBeenCalledWith([]);
	});
});

describe("HazardousEventSpatialFootprintMap prefill and division preview", () => {
	it("renders prefilled geometries on mount, and a previewDivisions entry as its own separate, non-persisted overlay", async () => {
		const division = {
			id: "div-1",
			name: "Division One",
			geojson: {
				type: "Polygon",
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 1],
						[0, 0],
					],
				],
			},
		};

		renderMap({ geometries: [POLYGON_GEOMETRY], previewDivisions: [division] });

		await waitFor(() =>
			expect(fakeL.geoJSON).toHaveBeenCalledWith(POLYGON_GEOMETRY),
		);
		expect(fakeL.geoJSON).toHaveBeenCalledWith(division.geojson);

		// A persisted-geometries layer group and a non-persisted division-preview layer group
		// are kept structurally separate, not one shared group.
		expect(featureGroupInstances.length).toBeGreaterThanOrEqual(2);
	});

	it("falls back to a default world view on mount when there's nothing to fit bounds to -- Leaflet throws on any draw without one", async () => {
		renderMap({ geometries: [], previewDivisions: [] });

		await waitFor(() => expect(fakeMapInstances.length).toBeGreaterThan(0));
		expect(latestMap().setView).toHaveBeenCalledWith([0, 0], 2);
		expect(latestMap().fitBounds).not.toHaveBeenCalled();
	});

	it("fits the view to prefilled geometries instead of the default world view when any exist", async () => {
		renderMap({ geometries: [POLYGON_GEOMETRY], previewDivisions: [] });

		await waitFor(() => expect(fakeMapInstances.length).toBeGreaterThan(0));
		await waitFor(() => expect(latestMap().fitBounds).toHaveBeenCalled());
		expect(latestMap().setView).not.toHaveBeenCalled();
	});

	it("fits the view to a prefilled marker too -- a real L.Marker child has no getBounds, only its L.geoJSON wrapper does", async () => {
		fakeL.geoJSON.mockImplementationOnce(() => {
			const markerLayer = { addTo: vi.fn().mockReturnThis() };
			return {
				addTo: vi.fn().mockReturnThis(),
				getBounds: vi.fn(() => ({ isValid: () => true, extend: vi.fn() })),
				getLayers: vi.fn(() => [markerLayer]),
			};
		});
		renderMap({
			geometries: [{ type: "Point", coordinates: [10, 20] }],
			previewDivisions: [],
		});

		await waitFor(() => expect(fakeMapInstances.length).toBeGreaterThan(0));
		await waitFor(() => expect(latestMap().fitBounds).toHaveBeenCalled());
		expect(latestMap().setView).not.toHaveBeenCalled();
	});
});

describe("HazardousEventSpatialFootprintMap map-library load failure (spec: Leaflet/leaflet-draw CDN load failure)", () => {
	it("ensureLeafletLoaded (or ensureLeafletDrawLoaded) resolving null renders a non-blocking unavailable message, never throws, and keeps Save Coordinates disabled", async () => {
		loaderState.leaflet = null;
		loaderState.draw = null;

		expect(() => renderMap()).not.toThrow();

		await waitFor(() =>
			expect(
				screen.getByText(
					hazardousEvents.form.fields.spatial_footprint_map.unavailable,
				),
			).toBeTruthy(),
		);
		expect(
			(
				screen.getByRole("button", {
					name: "Save Coordinates",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		expect(fakeL.map).not.toHaveBeenCalled();
	});
});

describe("HazardousEventSpatialFootprintMap Nominatim free-text location search", () => {
	function searchInput() {
		return screen.getByRole("textbox", {
			name: hazardousEvents.form.fields.spatial_footprint_map.search_label,
		});
	}

	it("submitting a non-empty query fetches Nominatim's search endpoint and leaves geometries/divisionIds unaffected on a successful result", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => [
				{ lat: "10", lon: "20", boundingbox: ["9", "11", "19", "21"] },
			],
		});
		const { onSave } = renderMap();

		fireEvent.change(searchInput(), { target: { value: "Paris" } });
		fireEvent.submit(searchInput().closest("form") as HTMLFormElement);

		await waitFor(() =>
			expect(global.fetch).toHaveBeenCalledWith(
				"https://nominatim.openstreetmap.org/search?q=Paris&format=json",
			),
		);
		// View-only: a successful search never touches the picker's own save-relevant state.
		await pressSave();
		expect(onSave).toHaveBeenCalledWith([]);
	});

	it("an empty query submission makes no fetch call and shows a prompt message", () => {
		renderMap();

		fireEvent.submit(searchInput().closest("form") as HTMLFormElement);

		expect(global.fetch).not.toHaveBeenCalled();
		expect(
			screen.getByText(
				hazardousEvents.form.fields.spatial_footprint_map.search_empty_prompt,
			),
		).toBeTruthy();
	});

	it("a zero-result response leaves geometries/divisionIds unaffected and shows a not-found message", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => [],
		});
		const { onSave } = renderMap();

		fireEvent.change(searchInput(), { target: { value: "Nowhereville" } });
		fireEvent.submit(searchInput().closest("form") as HTMLFormElement);

		await waitFor(() =>
			expect(
				screen.getByText(
					hazardousEvents.form.fields.spatial_footprint_map.search_not_found,
				),
			).toBeTruthy(),
		);
		await pressSave();
		expect(onSave).toHaveBeenCalledWith([]);
	});

	it("pressing Enter in the search input searches -- there is no Search button, as legacy", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => [
				{ lat: "10", lon: "20", boundingbox: ["9", "11", "19", "21"] },
			],
		});
		const user = userEvent.setup();
		renderMap();

		// Real keystrokes, not a direct form.submit() -- this is the exact path the Enter-key
		// bug report was about (implicit submit via the input, not programmatic submission).
		await user.type(searchInput(), "Paris{Enter}");

		await waitFor(() =>
			expect(global.fetch).toHaveBeenCalledWith(
				"https://nominatim.openstreetmap.org/search?q=Paris&format=json",
			),
		);
	});
});

describe("HazardousEventSpatialFootprintMap outside-division warning", () => {
	const division = {
		id: "div-1",
		name: "Division One",
		geojson: {
			type: "Polygon",
			coordinates: [
				[
					[0, 0],
					[1, 0],
					[1, 1],
					[0, 1],
					[0, 0],
				],
			],
		},
	};
	// Clearly outside `division`'s boundary -- confirmed below via the real
	// checkShapeAgainstDivisions, not assumed from the coordinates alone.
	const outsideGeometry = {
		type: "Polygon",
		coordinates: [
			[
				[10, 10],
				[11, 10],
				[11, 11],
				[10, 10],
			],
		],
	};
	// Fully inside `division`'s boundary.
	const insideGeometry = {
		type: "Polygon",
		coordinates: [
			[
				[0.2, 0.2],
				[0.3, 0.2],
				[0.3, 0.3],
				[0.2, 0.2],
			],
		],
	};

	it("confirms outsideGeometry is actually outside division, via the real checkShapeAgainstDivisions util (not assumed)", () => {
		const warning = checkShapeAgainstDivisions([division], {
			type: "Feature",
			geometry: outsideGeometry,
			properties: {},
		} as Parameters<typeof checkShapeAgainstDivisions>[1]);
		expect(warning).not.toBe("");
	});

	it("a shape outside every selected division's boundary shows a confirmation affordance before being added", async () => {
		const { onSave } = renderMap({ previewDivisions: [division] });

		await waitFor(() => expect(fakeMapInstances.length).toBeGreaterThan(0));
		const map = latestMap();
		const createdHandler = map._handlers[fakeL.Draw.Event.CREATED];

		createdHandler({
			layerType: "polygon",
			layer: fakePolygonLayer(outsideGeometry),
		});

		const dialog = await screen.findByRole("dialog");
		const warning = checkShapeAgainstDivisions([division], {
			type: "Feature",
			geometry: outsideGeometry,
			properties: {},
		} as Parameters<typeof checkShapeAgainstDivisions>[1]);
		expect(dialog.textContent).toContain(warning);
		// Not added while pending -- "Edit shape" needs a shape.
		expect(editOption().disabled).toBe(true);
		expect(onSave).not.toHaveBeenCalled();
	});

	it("confirming the outside-division warning adds the shape anyway", async () => {
		const { onSave } = renderMap({ previewDivisions: [division] });

		await waitFor(() => expect(fakeMapInstances.length).toBeGreaterThan(0));
		const map = latestMap();
		const createdHandler = map._handlers[fakeL.Draw.Event.CREATED];
		createdHandler({
			layerType: "polygon",
			layer: fakePolygonLayer(outsideGeometry),
		});

		await screen.findByRole("dialog");
		fireEvent.click(
			screen.getByRole("button", {
				name: hazardousEvents.form.fields.spatial_footprint_map
					.outside_division_confirm,
			}),
		);

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await pressSave();
		expect(onSave).toHaveBeenCalledWith([outsideGeometry]);
	});

	it("cancelling the outside-division warning discards the shape, never adding it", async () => {
		const { onSave } = renderMap({ previewDivisions: [division] });

		await waitFor(() => expect(fakeMapInstances.length).toBeGreaterThan(0));
		const map = latestMap();
		const createdHandler = map._handlers[fakeL.Draw.Event.CREATED];
		createdHandler({
			layerType: "polygon",
			layer: fakePolygonLayer(outsideGeometry),
		});

		await screen.findByRole("dialog");
		fireEvent.click(
			screen.getByRole("button", {
				name: hazardousEvents.form.fields.spatial_footprint_map
					.outside_division_cancel,
			}),
		);

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await pressSave();
		expect(onSave).toHaveBeenCalledWith([]);
	});

	it("no division selected skips the check entirely -- the shape is added immediately with no confirmation affordance", async () => {
		const { onSave } = renderMap({ previewDivisions: [] });

		await waitFor(() => expect(fakeMapInstances.length).toBeGreaterThan(0));
		const map = latestMap();
		const createdHandler = map._handlers[fakeL.Draw.Event.CREATED];
		createdHandler({
			layerType: "polygon",
			layer: fakePolygonLayer(outsideGeometry),
		});

		expect(screen.queryByRole("dialog")).toBeNull();
		await pressSave();
		expect(onSave).toHaveBeenCalledWith([outsideGeometry]);
	});

	it("a division selected after mount (via rerender) is still honoured by a later draw -- not a stale closure over the initial empty previewDivisions", async () => {
		const { rerenderWith } = renderMap({ previewDivisions: [] });

		await waitFor(() => expect(fakeMapInstances.length).toBeGreaterThan(0));
		const map = latestMap();

		rerenderWith({ previewDivisions: [division] });

		const createdHandler = map._handlers[fakeL.Draw.Event.CREATED];
		createdHandler({
			layerType: "polygon",
			layer: fakePolygonLayer(outsideGeometry),
		});

		await screen.findByRole("dialog");
		expect(editOption().disabled).toBe(true);
	});

	it("a shape inside at least one selected division's boundary is added immediately with no warning shown", async () => {
		const { onSave } = renderMap({ previewDivisions: [division] });

		await waitFor(() => expect(fakeMapInstances.length).toBeGreaterThan(0));
		const map = latestMap();
		const createdHandler = map._handlers[fakeL.Draw.Event.CREATED];
		createdHandler({
			layerType: "polygon",
			layer: fakePolygonLayer(insideGeometry),
		});

		expect(screen.queryByRole("dialog")).toBeNull();
		await pressSave();
		expect(onSave).toHaveBeenCalledWith([insideGeometry]);
	});
});

describe("HazardousEventSpatialFootprintMap draw-active reporting", () => {
	// A hosting Dialog disables its own Escape-to-close while a draw is active (via
	// Dialog's dismissDisabled prop) -- this component's only job is reporting the state
	// truthfully, not intercepting Escape itself. See HazardousEventSpatialFootprintMapDialog's
	// own tests for that integration.
	it("calls onDrawActiveChange(true) on DRAWSTART and (false) on DRAWSTOP", async () => {
		const onDrawActiveChange = vi.fn();
		renderMap({ onDrawActiveChange });

		await waitFor(() => expect(fakeMapInstances.length).toBeGreaterThan(0));
		const map = latestMap();

		map._handlers[fakeL.Draw.Event.DRAWSTART]({});
		expect(onDrawActiveChange).toHaveBeenLastCalledWith(true);

		map._handlers[fakeL.Draw.Event.DRAWSTOP]({});
		expect(onDrawActiveChange).toHaveBeenLastCalledWith(false);
	});

	it("a new onDrawActiveChange passed via rerender is still the one invoked -- not a stale closure", async () => {
		const firstCallback = vi.fn();
		const secondCallback = vi.fn();
		const { rerenderWith } = renderMap({ onDrawActiveChange: firstCallback });

		await waitFor(() => expect(fakeMapInstances.length).toBeGreaterThan(0));
		const map = latestMap();

		rerenderWith({ onDrawActiveChange: secondCallback });
		map._handlers[fakeL.Draw.Event.DRAWSTART]({});

		expect(secondCallback).toHaveBeenCalledWith(true);
		expect(firstCallback).not.toHaveBeenCalled();
	});
});

describe("HazardousEventSpatialFootprintMap Mapper toolbar", () => {
	function modeSelect() {
		return screen.getByRole("combobox", {
			name: "Drawing mode",
		}) as HTMLSelectElement;
	}

	async function readyMap() {
		await waitFor(() => expect(modeSelect().disabled).toBe(false));
		return latestMap();
	}

	function chooseMode(value: string) {
		fireEvent.change(modeSelect(), { target: { value } });
	}

	function drawnLayer(geometry: unknown) {
		return {
			toGeoJSON: vi.fn(() => ({ type: "Feature", geometry, properties: {} })),
		};
	}

	const MOVED_POLYGON = {
		type: "Polygon",
		coordinates: [
			[
				[0, 0],
				[5, 0],
				[5, 5],
				[0, 0],
			],
		],
	};

	it("choosing a drawing mode starts that leaflet-draw tool; the dropdown returns to Move map when the draw stops", async () => {
		renderMap();
		const map = await readyMap();

		chooseMode("rectangle");

		const tool = drawHandlerInstances[drawHandlerInstances.length - 1];
		expect(tool.kind).toBe("Rectangle");
		expect(tool.enable).toHaveBeenCalled();
		expect(modeSelect().value).toBe("rectangle");

		act(() => map._handlers[fakeL.Draw.Event.DRAWSTOP]({}));
		expect(modeSelect().value).toBe("move");
	});

	it("unmounting mid-draw disables the active tool -- leaflet-draw's page-wide listeners would outlive the map otherwise", async () => {
		const { unmount } = renderMap();
		await readyMap();
		chooseMode("rectangle");
		const tool = drawHandlerInstances[drawHandlerInstances.length - 1];

		unmount();

		expect(tool.disable).toHaveBeenCalled();
	});

	it("choosing a drawing mode while a shape exists asks first -- Keep leaves it, Proceed starts the tool and keeps the shape until a new one is drawn", async () => {
		renderMap();
		const map = await readyMap();
		act(() =>
			map._handlers[fakeL.Draw.Event.CREATED]({
				layerType: "polygon",
				layer: drawnLayer(POLYGON_GEOMETRY),
			}),
		);

		chooseMode("polygon");
		expect(screen.getByText("Replace current shape?")).toBeTruthy();
		expect(drawHandlerInstances).toHaveLength(0);

		fireEvent.click(screen.getByRole("button", { name: "Keep current shape" }));
		expect(editOption().disabled).toBe(false);
		expect(modeSelect().value).toBe("move");

		chooseMode("polygon");
		fireEvent.click(screen.getByRole("button", { name: "Proceed" }));
		expect(editOption().disabled).toBe(false);
		expect(drawHandlerInstances[0].kind).toBe("Polygon");
		expect(drawHandlerInstances[0].enable).toHaveBeenCalled();
	});

	describe("replacing the shape (one shape per item)", () => {
		const NEW_RECTANGLE = {
			type: "Polygon",
			coordinates: [
				[
					[2, 2],
					[3, 2],
					[3, 3],
					[2, 3],
					[2, 2],
				],
			],
		};
		const DIVISION = {
			id: "div-1",
			name: "Division One",
			geojson: {
				type: "Polygon",
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 1],
						[0, 0],
					],
				],
			},
		};
		const INSIDE = {
			type: "Polygon",
			coordinates: [
				[
					[0.2, 0.2],
					[0.4, 0.2],
					[0.4, 0.4],
					[0.2, 0.2],
				],
			],
		};

		async function startReplacing(
			props: RenderProps = {},
			original: unknown = POLYGON_GEOMETRY,
			tool = "rectangle",
		) {
			const utils = renderMap(props);
			const map = await readyMap();
			act(() =>
				map._handlers[fakeL.Draw.Event.CREATED]({
					layerType: "polygon",
					layer: drawnLayer(original),
				}),
			);
			chooseMode(tool);
			fireEvent.click(screen.getByRole("button", { name: "Proceed" }));
			return { ...utils, map };
		}

		// leaflet-draw fires CREATED, then DRAWSTOP, when a shape completes.
		function completeDraw(map: FakeMap, geometry: unknown) {
			act(() => {
				map._handlers[fakeL.Draw.Event.CREATED]({
					layerType: "rectangle",
					layer: drawnLayer(geometry),
				});
				map._handlers[fakeL.Draw.Event.DRAWSTOP]({});
			});
		}

		it("Escape before the new shape is finished keeps the original shape", async () => {
			const { onSave } = await startReplacing();

			fireEvent.keyDown(document, { key: "Escape" });
			await pressSave();

			expect(onSave).toHaveBeenLastCalledWith([POLYGON_GEOMETRY]);
		});

		it("leaflet-draw cancelling the draw itself (DRAWSTOP, no CREATED) keeps the original shape", async () => {
			const { onSave, map } = await startReplacing();

			act(() => map._handlers[fakeL.Draw.Event.DRAWSTOP]({}));
			await pressSave();

			expect(onSave).toHaveBeenLastCalledWith([POLYGON_GEOMETRY]);
		});

		it("Save Coordinates with a polygon left unfinished saves the original shape", async () => {
			const { onSave } = await startReplacing({}, POLYGON_GEOMETRY, "polygon");

			await pressSave();

			expect(onSave).toHaveBeenLastCalledWith([POLYGON_GEOMETRY]);
		});

		it("Undo during a rectangle/circle/marker draw cancels it and keeps the original shape", async () => {
			const { onSave } = await startReplacing();

			fireEvent.click(screen.getByRole("button", { name: "Undo" }));

			expect(drawHandlerInstances[0].disable).toHaveBeenCalled();
			expect(modeSelect().value).toBe("move");
			await pressSave();
			expect(onSave).toHaveBeenLastCalledWith([POLYGON_GEOMETRY]);
		});

		it("switching to another drawing tool mid-replace asks again, and Keep leaves the original", async () => {
			const { onSave } = await startReplacing();

			chooseMode("circle");
			fireEvent.click(
				screen.getByRole("button", { name: "Keep current shape" }),
			);
			await pressSave();

			expect(onSave).toHaveBeenLastCalledWith([POLYGON_GEOMETRY]);
		});

		it("finishing the new shape replaces the original -- only the new one is saved", async () => {
			const { onSave, map } = await startReplacing();

			completeDraw(map, NEW_RECTANGLE);
			await pressSave();

			expect(onSave).toHaveBeenLastCalledWith([NEW_RECTANGLE]);
		});

		it("a degenerate new shape is rejected and the original stays", async () => {
			const { onSave, map } = await startReplacing();

			completeDraw(map, {
				type: "Polygon",
				coordinates: [
					[
						[0, 0],
						[1, 1],
						[0, 0],
					],
				],
			});
			await pressSave();

			expect(onSave).toHaveBeenLastCalledWith([POLYGON_GEOMETRY]);
		});

		it("a new shape outside the divisions replaces the original only after Add anyway", async () => {
			const { onSave, map } = await startReplacing(
				{ previewDivisions: [DIVISION] },
				INSIDE,
			);

			completeDraw(map, NEW_RECTANGLE);
			fireEvent.click(
				await screen.findByRole("button", { name: "Add anyway" }),
			);
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
			await pressSave();

			expect(onSave).toHaveBeenLastCalledWith([NEW_RECTANGLE]);
		});

		it("Discard shape on an outside-division replacement keeps the original", async () => {
			const { onSave, map } = await startReplacing(
				{ previewDivisions: [DIVISION] },
				INSIDE,
			);

			completeDraw(map, NEW_RECTANGLE);
			fireEvent.click(
				await screen.findByRole("button", { name: "Discard shape" }),
			);
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
			await pressSave();

			expect(onSave).toHaveBeenLastCalledWith([INSIDE]);
		});
	});

	it("Undo mid-draw removes the last point; with no draw in progress it removes the shape", async () => {
		const { onSave } = renderMap();
		const map = await readyMap();

		chooseMode("polyline");
		fireEvent.click(screen.getByRole("button", { name: "Undo" }));
		expect(drawHandlerInstances[0].deleteLastVertex).toHaveBeenCalledTimes(1);

		act(() => {
			map._handlers[fakeL.Draw.Event.CREATED]({
				layerType: "polyline",
				layer: drawnLayer({
					type: "LineString",
					coordinates: [
						[0, 0],
						[1, 1],
					],
				}),
			});
			map._handlers[fakeL.Draw.Event.DRAWSTOP]({});
		});
		fireEvent.click(screen.getByRole("button", { name: "Undo" }));
		await pressSave();
		expect(onSave).toHaveBeenLastCalledWith([]);
	});

	it("Undo on a prefilled shape removes its real inner layer, not the L.geoJSON wrapper", async () => {
		const { onSave } = renderMap({
			geometries: [POLYGON_GEOMETRY],
		});
		await readyMap();
		const shapesGroup = featureGroupInstances[0];
		const innerLayer = fakeL.geoJSON.mock.results[0].value.getLayers()[0];
		expect(shapesGroup.layers).toContain(innerLayer);

		fireEvent.click(screen.getByRole("button", { name: "Undo" }));

		expect(shapesGroup.layers).not.toContain(innerLayer);
		await pressSave();
		expect(onSave).toHaveBeenLastCalledWith([]);
	});

	it("Clear removes every shape and stops any active tool", async () => {
		const { onSave } = renderMap({
			geometries: [POLYGON_GEOMETRY],
		});
		await readyMap();
		chooseMode("edit");

		fireEvent.click(screen.getByRole("button", { name: "Clear" }));

		expect(editHandlerInstances[0].disable).toHaveBeenCalled();
		// Clear discards -- it never commits an in-progress edit first.
		expect(editHandlerInstances[0].save).not.toHaveBeenCalled();
		expect(modeSelect().value).toBe("move");
		await pressSave();
		expect(onSave).toHaveBeenLastCalledWith([]);
	});

	it("Edit shape is unavailable with no shape; once edited, Save Coordinates commits the moved points before saving", async () => {
		const { onSave } = renderMap();
		const map = await readyMap();
		expect(editOption().disabled).toBe(true);

		const layer = drawnLayer(POLYGON_GEOMETRY);
		act(() =>
			map._handlers[fakeL.Draw.Event.CREATED]({ layerType: "polygon", layer }),
		);
		expect(editOption().disabled).toBe(false);

		chooseMode("edit");
		expect(editHandlerInstances[0].enable).toHaveBeenCalled();
		// The user drags a point -- the layer now reports its moved geometry.
		layer.toGeoJSON.mockReturnValue({
			type: "Feature",
			geometry: MOVED_POLYGON,
			properties: {},
		});

		fireEvent.click(screen.getByRole("button", { name: "Save Coordinates" }));

		expect(editHandlerInstances[0].save).toHaveBeenCalled();
		expect(onSave).toHaveBeenCalledWith([MOVED_POLYGON]);
	});

	it("an edited circle is saved as its polygon conversion, not the degenerate Point toGeoJSON() gives", async () => {
		const { onSave } = renderMap();
		const map = await readyMap();
		const circle = {
			getLatLng: () => ({ lat: 1, lng: 2 }),
			getRadius: () => 1000,
			toGeoJSON: () => ({
				type: "Feature",
				geometry: { type: "Point", coordinates: [2, 1] },
				properties: {},
			}),
		};
		act(() =>
			map._handlers[fakeL.Draw.Event.CREATED]({
				layerType: "circle",
				layer: circle,
			}),
		);

		chooseMode("edit");
		fireEvent.click(screen.getByRole("button", { name: "Save Coordinates" }));

		expect(onSave).toHaveBeenCalledWith([
			expect.objectContaining({ type: "Polygon" }),
		]);
	});

	describe("an edited shape is validated like a new one", () => {
		const DIVISION = {
			id: "div-1",
			name: "Division One",
			geojson: {
				type: "Polygon",
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 1],
						[0, 0],
					],
				],
			},
		};
		const INSIDE = {
			type: "Polygon",
			coordinates: [
				[
					[0.2, 0.2],
					[0.4, 0.2],
					[0.4, 0.4],
					[0.2, 0.2],
				],
			],
		};
		const MOVED_OUTSIDE = {
			type: "Polygon",
			coordinates: [
				[
					[5, 5],
					[6, 5],
					[6, 6],
					[5, 5],
				],
			],
		};
		const MOVED_POLYGON_INSIDE = {
			type: "Polygon",
			coordinates: [
				[
					[0.5, 0.5],
					[0.7, 0.5],
					[0.7, 0.7],
					[0.5, 0.5],
				],
			],
		};
		const DEGENERATE = {
			type: "Polygon",
			coordinates: [
				[
					[0.2, 0.2],
					[0.4, 0.4],
					[0.2, 0.2],
				],
			],
		};

		// Draws INSIDE, enters Edit shape and "drags" the layer to `moved`.
		async function editShapeTo(moved: unknown, props: RenderProps = {}) {
			const utils = renderMap(props);
			const map = await readyMap();
			const layer = drawnLayer(INSIDE);
			act(() =>
				map._handlers[fakeL.Draw.Event.CREATED]({
					layerType: "polygon",
					layer,
				}),
			);
			chooseMode("edit");
			layer.toGeoJSON.mockReturnValue({
				type: "Feature",
				geometry: moved,
				properties: {},
			});
			return { ...utils, layer, shapesGroup: featureGroupInstances[0] };
		}

		it("a degenerate edit is reverted to the pre-edit shape, on the map too, with the degenerate message", async () => {
			const { layer, shapesGroup } = await editShapeTo(DEGENERATE);
			const geoJsonCalls = fakeL.geoJSON.mock.calls.length;

			chooseMode("move");

			expect(
				screen.getByText(
					hazardousEvents.form.fields.spatial_footprint_map.degenerate_shape,
				),
			).toBeTruthy();
			expect(shapesGroup.layers).not.toContain(layer);
			expect(fakeL.geoJSON.mock.calls.slice(geoJsonCalls)).toEqual([[INSIDE]]);
			expect(shapesGroup.layers).toHaveLength(1);
		});

		it("Save Coordinates on a degenerate edit stops to show the message; saving again keeps the pre-edit shape", async () => {
			const { onSave } = await editShapeTo(DEGENERATE);

			fireEvent.click(screen.getByRole("button", { name: "Save Coordinates" }));

			expect(onSave).not.toHaveBeenCalled();
			expect(
				screen.getByText(
					hazardousEvents.form.fields.spatial_footprint_map.degenerate_shape,
				),
			).toBeTruthy();
			await pressSave();
			expect(onSave).toHaveBeenLastCalledWith([INSIDE]);
		});

		it("an edit moved outside the divisions asks first; Add anyway keeps the edit", async () => {
			const { onSave } = await editShapeTo(MOVED_OUTSIDE, {
				previewDivisions: [DIVISION],
			});

			chooseMode("move");
			fireEvent.click(
				await screen.findByRole("button", { name: "Add anyway" }),
			);
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
			await pressSave();

			expect(onSave).toHaveBeenLastCalledWith([MOVED_OUTSIDE]);
		});

		it("Discard shape on an outside-division edit reverts it to the pre-edit shape, on the map too", async () => {
			const { onSave, layer, shapesGroup } = await editShapeTo(MOVED_OUTSIDE, {
				previewDivisions: [DIVISION],
			});

			chooseMode("move");
			fireEvent.click(
				await screen.findByRole("button", { name: "Discard shape" }),
			);
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

			expect(shapesGroup.layers).not.toContain(layer);
			expect(shapesGroup.layers).toHaveLength(1);
			await pressSave();
			expect(onSave).toHaveBeenLastCalledWith([INSIDE]);
		});

		it("Save Coordinates on an outside-division edit waits for the answer instead of saving", async () => {
			const { onSave } = await editShapeTo(MOVED_OUTSIDE, {
				previewDivisions: [DIVISION],
			});

			fireEvent.click(screen.getByRole("button", { name: "Save Coordinates" }));

			expect(await screen.findByRole("dialog")).toBeTruthy();
			expect(onSave).not.toHaveBeenCalled();
		});

		it("choosing a drawing tool while an edit awaits confirmation shows only that confirmation", async () => {
			await editShapeTo(MOVED_OUTSIDE, { previewDivisions: [DIVISION] });

			chooseMode("rectangle");

			expect(
				await screen.findByRole("button", { name: "Add anyway" }),
			).toBeTruthy();
			expect(screen.queryByText("Replace current shape?")).toBeNull();
			expect(drawHandlerInstances).toHaveLength(0);
		});

		it("Undo after a reverted edit removes the shape and clears the degenerate message", async () => {
			const { onSave } = await editShapeTo(DEGENERATE);
			chooseMode("move");

			fireEvent.click(screen.getByRole("button", { name: "Undo" }));

			expect(
				screen.queryByText(
					hazardousEvents.form.fields.spatial_footprint_map.degenerate_shape,
				),
			).toBeNull();
			await pressSave();
			expect(onSave).toHaveBeenLastCalledWith([]);
		});

		it("an edit that stays inside the divisions is kept without asking", async () => {
			const { onSave } = await editShapeTo(MOVED_POLYGON_INSIDE, {
				previewDivisions: [DIVISION],
			});

			await pressSave();

			expect(screen.queryByRole("dialog")).toBeNull();
			expect(onSave).toHaveBeenLastCalledWith([MOVED_POLYGON_INSIDE]);
		});
	});

	it("Escape mid-draw cancels the tool from anywhere and returns to Move map", async () => {
		renderMap();
		await readyMap();
		chooseMode("polygon");

		fireEvent.keyDown(document, { key: "Escape" });

		expect(drawHandlerInstances[0].disable).toHaveBeenCalled();
		expect(modeSelect().value).toBe("move");
	});

	describe("degenerate-shape message lifetime", () => {
		const DEGENERATE_DRAW = {
			type: "Polygon",
			coordinates: [
				[
					[0, 0],
					[1, 1],
					[0, 0],
				],
			],
		};

		async function rejectDegenerateDraw() {
			const utils = renderMap();
			const map = await readyMap();
			rejectAgain(map);
			return { ...utils, map };
		}

		function rejectAgain(map: FakeMap) {
			act(() =>
				map._handlers[fakeL.Draw.Event.CREATED]({
					layerType: "polygon",
					layer: drawnLayer(DEGENERATE_DRAW),
				}),
			);
		}

		it("starting a new tool clears it", async () => {
			await rejectDegenerateDraw();
			expect(screen.getByRole("alert")).toBeTruthy();

			chooseMode("polygon");

			expect(screen.queryByRole("alert")).toBeNull();
		});

		it("Escape mid-draw clears it", async () => {
			renderMap();
			const map = await readyMap();
			chooseMode("polygon");
			rejectAgain(map);
			expect(screen.getByRole("alert")).toBeTruthy();

			fireEvent.keyDown(document, { key: "Escape" });

			expect(screen.queryByRole("alert")).toBeNull();
		});

		it("Save Coordinates clears it", async () => {
			await rejectDegenerateDraw();

			await pressSave();

			expect(screen.queryByRole("alert")).toBeNull();
		});

		it("a second identical rejection re-announces it (a fresh alert element)", async () => {
			const { map } = await rejectDegenerateDraw();
			const firstAlert = screen.getByRole("alert");

			rejectAgain(map);

			const secondAlert = screen.getByRole("alert");
			expect(secondAlert.textContent).toBe(firstAlert.textContent);
			expect(secondAlert).not.toBe(firstAlert);
		});
	});
});

// Integration regression test, against the real Map inside the real MapDialog -- a mocked Map
// can't reproduce this: the bug is specifically in what HazardousEventSpatialFootprintMap's own
// one-time ([]-deps) mount effect reads on its very first invocation.
describe("HazardousEventSpatialFootprintMapDialog + Map: reopen with a different committed value", () => {
	const GEOM_A = { type: "Point", coordinates: [1, 1] };
	const GEOM_EXTRA = { type: "Point", coordinates: [2, 2] };
	const GEOM_B = { type: "Point", coordinates: [3, 3] };

	function renderDialog(
		isOpen: boolean,
		initialGeometries: readonly unknown[],
	) {
		return render(
			<I18nextProvider i18n={testI18n}>
				<HazardousEventSpatialFootprintMapDialog
					isOpen={isOpen}
					initialGeometries={initialGeometries}
					previewDivisions={[]}
					title="Mapper"
					onSave={vi.fn()}
					onCancel={vi.fn()}
				/>
			</I18nextProvider>,
		);
	}

	it("a second open with a different committed value prefills the map with that value, not the prior session's leftover buffer", async () => {
		const { rerender } = renderDialog(false, [GEOM_A]);

		rerender(
			<I18nextProvider i18n={testI18n}>
				<HazardousEventSpatialFootprintMapDialog
					isOpen
					initialGeometries={[GEOM_A]}
					previewDivisions={[]}
					title="Mapper"
					onSave={vi.fn()}
					onCancel={vi.fn()}
				/>
			</I18nextProvider>,
		);
		await waitFor(() => expect(fakeMapInstances.length).toBe(1));
		await waitFor(() => expect(fakeL.geoJSON).toHaveBeenCalledWith(GEOM_A));

		// Dirty the session's buffer with an extra drawn shape, then close without saving.
		const firstMap = latestMap();
		firstMap._handlers[fakeL.Draw.Event.CREATED]({
			layerType: "marker",
			layer: fakePolygonLayer(GEOM_EXTRA),
		});

		rerender(
			<I18nextProvider i18n={testI18n}>
				<HazardousEventSpatialFootprintMapDialog
					isOpen={false}
					initialGeometries={[GEOM_A]}
					previewDivisions={[]}
					title="Mapper"
					onSave={vi.fn()}
					onCancel={vi.fn()}
				/>
			</I18nextProvider>,
		);

		const callsBeforeReopen = fakeL.geoJSON.mock.calls.length;

		// Reopen with the caller's own, now-different committed value (e.g. a sibling row's
		// Edit was clicked, or this row's data changed between sessions).
		rerender(
			<I18nextProvider i18n={testI18n}>
				<HazardousEventSpatialFootprintMapDialog
					isOpen
					initialGeometries={[GEOM_B]}
					previewDivisions={[]}
					title="Mapper"
					onSave={vi.fn()}
					onCancel={vi.fn()}
				/>
			</I18nextProvider>,
		);
		await waitFor(() => expect(fakeMapInstances.length).toBe(2));

		const callsAfterReopen = fakeL.geoJSON.mock.calls.slice(callsBeforeReopen);
		expect(callsAfterReopen).toContainEqual([GEOM_B]);
		expect(callsAfterReopen).not.toContainEqual([GEOM_A]);
		expect(callsAfterReopen).not.toContainEqual([GEOM_EXTRA]);
	});

	it("opening the Mapper focuses its search field, as legacy does", async () => {
		renderDialog(true, []);

		await waitFor(() =>
			expect(document.activeElement).toBe(
				screen.getByRole("textbox", { name: "Search for a location" }),
			),
		);
	});

	// StrictMode double-invokes render -- this guards against a ref-based reset (written to
	// during render) surviving the first, discarded invocation and masking the reset on the
	// second, real one. State, not a ref, is what makes this test pass.
	it("the same reopen scenario holds under StrictMode's double-rendering", async () => {
		const { rerender } = render(
			<StrictMode>
				<I18nextProvider i18n={testI18n}>
					<HazardousEventSpatialFootprintMapDialog
						isOpen={false}
						initialGeometries={[GEOM_A]}
						previewDivisions={[]}
						title="Mapper"
						onSave={vi.fn()}
						onCancel={vi.fn()}
					/>
				</I18nextProvider>
			</StrictMode>,
		);

		rerender(
			<StrictMode>
				<I18nextProvider i18n={testI18n}>
					<HazardousEventSpatialFootprintMapDialog
						isOpen
						initialGeometries={[GEOM_A]}
						previewDivisions={[]}
						title="Mapper"
						onSave={vi.fn()}
						onCancel={vi.fn()}
					/>
				</I18nextProvider>
			</StrictMode>,
		);
		await waitFor(() => expect(fakeMapInstances.length).toBe(1));
		await waitFor(() => expect(fakeL.geoJSON).toHaveBeenCalledWith(GEOM_A));

		rerender(
			<StrictMode>
				<I18nextProvider i18n={testI18n}>
					<HazardousEventSpatialFootprintMapDialog
						isOpen={false}
						initialGeometries={[GEOM_A]}
						previewDivisions={[]}
						title="Mapper"
						onSave={vi.fn()}
						onCancel={vi.fn()}
					/>
				</I18nextProvider>
			</StrictMode>,
		);

		const callsBeforeReopen = fakeL.geoJSON.mock.calls.length;

		rerender(
			<StrictMode>
				<I18nextProvider i18n={testI18n}>
					<HazardousEventSpatialFootprintMapDialog
						isOpen
						initialGeometries={[GEOM_B]}
						previewDivisions={[]}
						title="Mapper"
						onSave={vi.fn()}
						onCancel={vi.fn()}
					/>
				</I18nextProvider>
			</StrictMode>,
		);
		await waitFor(() => expect(fakeMapInstances.length).toBe(2));

		const callsAfterReopen = fakeL.geoJSON.mock.calls.slice(callsBeforeReopen);
		expect(callsAfterReopen).toContainEqual([GEOM_B]);
		expect(callsAfterReopen).not.toContainEqual([GEOM_A]);
	});
});
