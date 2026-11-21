import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
	ensureLeafletLoaded,
	ensureLeafletDrawLoaded,
	type LeafletMap,
	type LeafletNamespace,
	type LeafletLayer,
	type LeafletDrawLayer,
	type LeafletFeatureGroup,
	type LeafletDrawCreatedEvent,
	type LeafletDrawNamespace,
	type LeafletDrawHandler,
	type LeafletEditHandler,
} from "./leafletLoader";
import { checkShapeAgainstDivisions } from "~/utils/spatialUtils";
import { toDivisionGeometry } from "./divisionGeometry";
import {
	isDegenerate,
	extractGeometry,
	geometryFromLayer,
	type BareGeometry,
} from "./spatialFootprintGeometry";
import { searchLocation } from "./locationSearch";
import { Dialog } from "~/design-system/components/Dialog";
import { Button } from "~/design-system/components/Button";

export interface HazardousEventSpatialFootprintMapProps {
	geometries: readonly unknown[];
	/** Save Coordinates -- gets the current shapes directly (any in-progress edit committed first),
	 * so the host never reads a render-stale copy. */
	onSave: (geometries: readonly unknown[]) => void;
	previewDivisions: readonly { id: string; name: string; geojson: unknown }[];
	"aria-label": string;
	/** Reports leaflet-draw's own DRAWSTART/DRAWSTOP so a hosting Dialog can disable its
	 * Escape-to-close while a draw is active, instead of this component reaching for one. */
	onDrawActiveChange?: (active: boolean) => void;
}

/** Legacy Mapper's drawing modes, plus "edit" (moving an existing shape's points). */
export type MapperMode =
	| "move"
	| "polygon"
	| "polyline"
	| "rectangle"
	| "circle"
	| "marker"
	| "edit";

type DrawMode = Exclude<MapperMode, "move" | "edit">;

const DRAW_HANDLER: Record<
	DrawMode,
	"Polygon" | "Polyline" | "Rectangle" | "Circle" | "Marker"
> = {
	polygon: "Polygon",
	polyline: "Polyline",
	rectangle: "Rectangle",
	circle: "Circle",
	marker: "Marker",
};

const MODES: readonly MapperMode[] = [
	"move",
	"polygon",
	"polyline",
	"rectangle",
	"circle",
	"marker",
	"edit",
];

interface DrawnShape {
	layer: LeafletLayer;
	geometry: unknown;
}

interface LayersEvent {
	layers: { eachLayer(callback: (layer: LeafletLayer) => void): void };
}

type PendingWarning = {
	geometry: BareGeometry;
	layer: LeafletLayer;
	text: string;
} & ({ kind: "draw"; replace: boolean } | { kind: "edit" });

function isDrawMode(mode: MapperMode): mode is DrawMode {
	return mode !== "move" && mode !== "edit";
}

/** Edit/remove act on L.geoJSON()'s child layer; only the wrapper has bounds for every type. */
function geoJsonShape(
	L: LeafletNamespace,
	geometry: unknown,
): { wrapper: LeafletLayer; layer: LeafletLayer } {
	const wrapper = L.geoJSON(geometry);
	return { wrapper, layer: wrapper.getLayers?.()[0] ?? wrapper };
}

/** Legacy Mapper's toolbar (search, mode dropdown, Clear, Undo, Save Coordinates) over a
 * leaflet-draw map. One shape per item -- the Add/Edit flows keep only the first. */
export function HazardousEventSpatialFootprintMap({
	geometries,
	onSave,
	previewDivisions,
	"aria-label": ariaLabel,
	onDrawActiveChange,
}: HazardousEventSpatialFootprintMapProps) {
	const { t } = useTranslation("hazardous-events");
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<LeafletMap | null>(null);
	const leafletRef = useRef<LeafletDrawNamespace | null>(null);
	const shapesGroupRef = useRef<LeafletFeatureGroup | null>(null);
	const previewGroupRef = useRef<LeafletFeatureGroup | null>(null);
	const shapesRef = useRef<DrawnShape[]>([]);
	const drawHandlerRef = useRef<LeafletDrawHandler | null>(null);
	const editHandlerRef = useRef<LeafletEditHandler | null>(null);
	// Read inside map event handlers registered once at mount -- refs avoid stale closures.
	const previewDivisionsRef = useRef(previewDivisions);
	previewDivisionsRef.current = previewDivisions;
	const onDrawActiveChangeRef = useRef(onDrawActiveChange);
	onDrawActiveChangeRef.current = onDrawActiveChange;
	const [mapState, setMapState] = useState<"loading" | "ready" | "unavailable">(
		"loading",
	);
	const [mode, setMode] = useState<MapperMode>("move");
	const [shapeCount, setShapeCount] = useState(geometries.length);
	const [pendingReplace, setPendingReplace] = useState<DrawMode | null>(null);
	// `id` re-keys the alert so a second identical rejection is announced again.
	const [degenerateMessage, setDegenerateMessageState] = useState<{
		text: string;
		id: number;
	} | null>(null);
	function setDegenerateMessage(text: string | null) {
		setDegenerateMessageState((prev) =>
			text === null ? null : { text, id: (prev?.id ?? 0) + 1 },
		);
	}
	const [searchMessage, setSearchMessage] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [pendingWarning, setPendingWarning] = useState<PendingWarning | null>(
		null,
	);
	// Set by "Proceed" on the replace confirm; the old shape goes only when a new one is committed.
	const replaceOnCreateRef = useRef(false);
	// Set when a committed edit was reverted or awaits confirmation -- the caller's next step waits.
	const editHeldRef = useRef(false);

	function publish() {
		setShapeCount(shapesRef.current.length);
	}

	function addShape(layer: LeafletLayer, geometry: BareGeometry) {
		shapesGroupRef.current?.addLayer(layer);
		shapesRef.current = [...shapesRef.current, { layer, geometry }];
		publish();
	}

	function clearShapes() {
		shapesGroupRef.current?.clearLayers();
		shapesRef.current = [];
		publish();
	}

	function commitDrawn(
		layer: LeafletLayer,
		geometry: BareGeometry,
		replace: boolean,
	) {
		if (replace) clearShapes();
		addShape(layer, geometry);
	}

	function setShapeGeometry(layer: LeafletLayer, geometry: BareGeometry) {
		shapesRef.current = shapesRef.current.map((shape) =>
			shape.layer === layer ? { layer, geometry } : shape,
		);
	}

	// Swaps the edited layer for a fresh one built from the stored geometry -- leaflet-draw's own
	// revert snapshot is gone once the edit tool is disabled.
	function revertShape(layer: LeafletLayer) {
		const L = leafletRef.current;
		const group = shapesGroupRef.current;
		const shape = shapesRef.current.find((s) => s.layer === layer);
		if (!L || !group || !shape) return;
		const restored = geoJsonShape(L, shape.geometry).layer;
		group.removeLayer(layer);
		group.addLayer(restored);
		shapesRef.current = shapesRef.current.map((s) =>
			s === shape ? { layer: restored, geometry: shape.geometry } : s,
		);
	}

	/** Empty when no division is selected or the shape touches one. */
	function outsideDivisionWarning(geometry: BareGeometry): string {
		const currentDivisions = previewDivisionsRef.current;
		if (currentDivisions.length === 0) return "";
		const checkDivisions = currentDivisions.map((d) => ({
			id: d.id,
			name: d.name,
			geojson: toDivisionGeometry(d.geojson) ?? d.geojson,
		}));
		// checkShapeAgainstDivisions expects turf's strict Geometry types; `geometry` here is
		// this module's own deliberately loose `{type, coordinates}` shape.
		return checkShapeAgainstDivisions(checkDivisions, {
			type: "Feature",
			geometry,
			properties: {},
		} as Parameters<typeof checkShapeAgainstDivisions>[1]);
	}

	function handleCreated(event: LeafletDrawCreatedEvent) {
		const replace = replaceOnCreateRef.current;
		replaceOnCreateRef.current = false;
		const geometry = extractGeometry(event);
		if (isDegenerate(geometry)) {
			setDegenerateMessage(
				t("form.fields.spatial_footprint_map.degenerate_shape"),
			);
			return;
		}
		setDegenerateMessage(null);

		const warning = outsideDivisionWarning(geometry);
		if (warning !== "") {
			setPendingWarning({
				kind: "draw",
				replace,
				geometry,
				layer: event.layer,
				text: warning,
			});
			return;
		}
		commitDrawn(event.layer, geometry, replace);
	}

	// Same checks as a new shape; a rejected edit goes back to its stored (pre-edit) geometry.
	function handleEdited(event: LayersEvent) {
		setDegenerateMessage(null);
		event.layers.eachLayer((layer) => {
			const geometry = geometryFromLayer(layer as LeafletDrawLayer);
			if (isDegenerate(geometry)) {
				revertShape(layer);
				setDegenerateMessage(
					t("form.fields.spatial_footprint_map.degenerate_shape"),
				);
				editHeldRef.current = true;
				return;
			}
			const warning = outsideDivisionWarning(geometry);
			if (warning !== "") {
				setPendingWarning({ kind: "edit", geometry, layer, text: warning });
				editHeldRef.current = true;
				return;
			}
			setShapeGeometry(layer, geometry);
		});
	}

	function confirmWarning() {
		if (!pendingWarning) return;
		const { layer, geometry } = pendingWarning;
		if (pendingWarning.kind === "edit") {
			setShapeGeometry(layer, geometry);
		} else {
			commitDrawn(layer, geometry, pendingWarning.replace);
		}
		setPendingWarning(null);
	}

	function cancelWarning() {
		// A CREATED layer was never added to the map; an edited one is put back.
		if (pendingWarning?.kind === "edit") revertShape(pendingWarning.layer);
		setPendingWarning(null);
	}

	/** Ends the active tool; an edit session is committed (save fires EDITED) unless discarding.
	 * True when that commit was held back for the user (reverted or awaiting confirmation). */
	function leaveMode(commitEdits = true): boolean {
		replaceOnCreateRef.current = false;
		editHeldRef.current = false;
		const edit = editHandlerRef.current;
		if (edit) {
			if (commitEdits) edit.save();
			edit.disable();
			editHandlerRef.current = null;
		}
		const draw = drawHandlerRef.current;
		drawHandlerRef.current = null;
		draw?.disable();
		return editHeldRef.current;
	}

	function startMode(next: MapperMode) {
		setDegenerateMessage(null);
		const map = mapRef.current;
		const L = leafletRef.current;
		if (!map || !L) return;
		if (next === "edit") {
			const group = shapesGroupRef.current;
			if (!group || shapesRef.current.length === 0) return;
			const handler = new L.EditToolbar.Edit(map, { featureGroup: group });
			editHandlerRef.current = handler;
			handler.enable();
		} else if (isDrawMode(next)) {
			const handler = new L.Draw[DRAW_HANDLER[next]](map, {});
			drawHandlerRef.current = handler;
			handler.enable();
		}
		setMode(next);
	}

	function selectMode(next: MapperMode) {
		if (next === mode) return;
		const held = leaveMode();
		setMode("move");
		if (held) return;
		// One shape per item -- drawing another would be silently dropped on save otherwise.
		if (isDrawMode(next) && shapesRef.current.length > 0) {
			setPendingReplace(next);
			return;
		}
		startMode(next);
	}

	function confirmReplace() {
		const next = pendingReplace;
		setPendingReplace(null);
		if (!next) return;
		replaceOnCreateRef.current = true;
		startMode(next);
	}

	function handleClear() {
		leaveMode(false);
		clearShapes();
		setDegenerateMessage(null);
		setMode("move");
	}

	// Mid-draw: drop the last point (polygon/line, as legacy) or cancel a point-less tool, keeping
	// the shape. Otherwise remove the shape.
	function handleUndo() {
		setDegenerateMessage(null);
		const draw = drawHandlerRef.current;
		if (draw?.deleteLastVertex) {
			draw.deleteLastVertex();
			return;
		}
		if (draw) {
			leaveMode(false);
			setMode("move");
			return;
		}
		if (shapesRef.current.length === 0) return;
		leaveMode(false);
		const last = shapesRef.current[shapesRef.current.length - 1];
		shapesGroupRef.current?.removeLayer(last.layer);
		shapesRef.current = shapesRef.current.slice(0, -1);
		publish();
		setMode("move");
	}

	function handleSave() {
		// Cleared first: a rejected edit committed by leaveMode() sets its own message.
		setDegenerateMessage(null);
		const held = leaveMode();
		setMode("move");
		if (held) return;
		onSave(shapesRef.current.map((s) => s.geometry));
	}

	// Mount-time only: the map instance persists across later draw/edit changes -- geometries/
	// previewDivisions prop changes after mount do not rebuild it.
	useEffect(() => {
		let cancelled = false;

		Promise.all([ensureLeafletLoaded(), ensureLeafletDrawLoaded()]).then(
			([L, LDraw]) => {
				if (cancelled || !L || !LDraw || !containerRef.current) {
					if (!cancelled) {
						setMapState("unavailable");
					}
					return;
				}

				const map = L.map(containerRef.current, { preferCanvas: true });
				mapRef.current = map;
				leafletRef.current = LDraw;
				L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
					attribution: "",
				}).addTo(map);

				const shapesGroup = new LDraw.FeatureGroup();
				shapesGroup.addTo(map);
				shapesGroupRef.current = shapesGroup;

				const previewGroup = new LDraw.FeatureGroup();
				previewGroup.addTo(map);
				previewGroupRef.current = previewGroup;

				// Leaflet throws "Set map center and zoom first" on any draw attempt until a view
				// exists -- same fallback as the read-only sibling map (HazardousEventLocationMap.tsx).
				const bounds = L.latLngBounds([]);
				function extendBounds(layer: LeafletLayer) {
					try {
						const layerBounds = layer.getBounds?.();
						if (layerBounds && layerBounds.isValid()) {
							bounds.extend(layerBounds);
						}
					} catch {
						// A malformed geometry's bounds must not block the rest of the layers.
					}
				}

				for (const geometry of geometries) {
					const { wrapper, layer } = geoJsonShape(L, geometry);
					shapesGroup.addLayer(layer);
					shapesRef.current = [...shapesRef.current, { layer, geometry }];
					// The wrapper, not the child: an L.Marker child has no getBounds.
					extendBounds(wrapper);
				}

				for (const division of previewDivisions) {
					const layer = L.geoJSON(division.geojson);
					layer.addTo(map);
					previewGroup.addLayer(layer);
					extendBounds(layer);
				}

				if (bounds.isValid()) {
					map.fitBounds(bounds, { padding: [24, 24] });
				} else {
					map.setView([0, 0], 2);
				}

				map.on(LDraw.Draw.Event.CREATED, (event: unknown) =>
					handleCreated(event as LeafletDrawCreatedEvent),
				);
				map.on(LDraw.Draw.Event.EDITED, (event: unknown) =>
					handleEdited(event as LayersEvent),
				);
				map.on(LDraw.Draw.Event.DRAWSTART, () => {
					onDrawActiveChangeRef.current?.(true);
				});
				// Fires after a shape completes and on Escape mid-draw -- back to "Move map" either way.
				map.on(LDraw.Draw.Event.DRAWSTOP, () => {
					// CREATED (which consumes it) fires first, so this only disarms a cancelled draw.
					replaceOnCreateRef.current = false;
					onDrawActiveChangeRef.current?.(false);
					if (drawHandlerRef.current) {
						drawHandlerRef.current = null;
						setMode("move");
					}
				});

				setMapState("ready");
			},
		);

		return () => {
			cancelled = true;
			// map.remove() doesn't disable standalone draw tools, whose page-wide listeners would leak.
			leaveMode(false);
			mapRef.current?.remove();
			mapRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// leaflet-draw hears Escape only with focus in the map; focus is usually in the toolbar.
	useEffect(() => {
		if (!isDrawMode(mode)) {
			return;
		}
		function cancelOnEscape(e: globalThis.KeyboardEvent) {
			if (e.key === "Escape" && drawHandlerRef.current) {
				leaveMode(false);
				setDegenerateMessage(null);
				setMode("move");
			}
		}
		document.addEventListener("keydown", cancelOnEscape);
		return () => document.removeEventListener("keydown", cancelOnEscape);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mode]);

	// previewDivisions alone is reactive -- the boundary-preview overlay tracks live
	// selection/deselection independent of the mount-time draw setup above.
	useEffect(() => {
		const L = leafletRef.current;
		const group = previewGroupRef.current;
		if (!L || !group || mapState !== "ready") {
			return;
		}
		group.clearLayers();
		for (const division of previewDivisions) {
			const layer = L.geoJSON(division.geojson);
			group.addLayer(layer);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [previewDivisions, mapState]);

	// Enter searches, as legacy -- there is no separate Search button.
	function handleSearch(e: FormEvent) {
		e.preventDefault();
		const query = searchQuery.trim();
		if (query === "") {
			setSearchMessage(
				t("form.fields.spatial_footprint_map.search_empty_prompt"),
			);
			return;
		}
		searchLocation(query).then((result) => {
			if (!result) {
				setSearchMessage(
					t("form.fields.spatial_footprint_map.search_not_found"),
				);
				return;
			}
			setSearchMessage(null);
			const map = mapRef.current;
			const L = leafletRef.current;
			if (!map || !L) return;
			if (result.boundingbox) {
				const [latMin, latMax, lonMin, lonMax] = result.boundingbox.map(Number);
				const bounds = L.latLngBounds([
					[latMin, lonMin],
					[latMax, lonMax],
				]);
				map.fitBounds(bounds, { padding: [50, 50] });
			} else {
				map.setView([Number(result.lat), Number(result.lon)], 14);
			}
		});
	}

	const ready = mapState === "ready";
	// Legacy's inline toolbar styles on Tailwind's scale: #777 bar, 8px gaps, 6px-radius fields.
	// leading-tight: text-base's own line-height would make the buttons taller than legacy's.
	const fieldClass =
		"min-w-40 rounded-md border border-black/35 bg-white px-3 py-2 max-md:basis-full";
	const toolButtonClass =
		"mg-button--small !px-3.5 !py-1.5 !text-base !leading-tight max-md:flex-1";

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-wrap items-center gap-2 bg-neutral-500 p-2">
				<form className="flex min-w-40 flex-1 basis-64" onSubmit={handleSearch}>
					{/* Legacy focuses the search on open. */}
					<input
						type="text"
						autoFocus
						className={`${fieldClass} w-full`}
						placeholder={t(
							"form.fields.spatial_footprint_map.search_placeholder",
						)}
						aria-label={t("form.fields.spatial_footprint_map.search_label")}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
				</form>
				<select
					className={`${fieldClass} basis-56`}
					aria-label={t("form.fields.spatial_footprint_map.mode_label")}
					value={mode}
					disabled={!ready}
					onChange={(e) => selectMode(e.target.value as MapperMode)}
				>
					{MODES.map((option) => (
						<option
							key={option}
							value={option}
							disabled={option === "edit" && shapeCount === 0}
						>
							{t(`form.fields.spatial_footprint_map.mode_${option}`)}
						</option>
					))}
				</select>
				<div className="ms-auto flex flex-wrap gap-2 max-md:w-full">
					<Button
						variant="system"
						className={toolButtonClass}
						disabled={!ready}
						onPress={handleClear}
					>
						{t("form.fields.spatial_footprint_map.clear")}
					</Button>
					<Button
						variant="system"
						className={toolButtonClass}
						disabled={!ready}
						onPress={handleUndo}
					>
						{t("form.fields.spatial_footprint_map.undo")}
					</Button>
					<Button
						variant="system-primary"
						className={toolButtonClass}
						disabled={!ready}
						onPress={handleSave}
					>
						{t("form.fields.spatial_footprint_map.save")}
					</Button>
				</div>
			</div>
			{mapState === "unavailable" && (
				<p>{t("form.fields.spatial_footprint_map.unavailable")}</p>
			)}
			{searchMessage && <p role="status">{searchMessage}</p>}
			{degenerateMessage && (
				<p key={degenerateMessage.id} role="alert" className="dts-inline-error">
					{degenerateMessage.text}
				</p>
			)}
			{/* Fills the rest of the screen (legacy used a fixed 500px); min-h-64 on short screens. */}
			<div
				ref={containerRef}
				role="region"
				aria-label={ariaLabel}
				className="min-h-64 w-full flex-1 bg-gray-100"
			/>
			{pendingReplace && (
				<Dialog
					isOpen
					onOpenChange={(open) => {
						if (!open) setPendingReplace(null);
					}}
					title={t("form.fields.spatial_footprint_map.replace_title")}
					closeLabel={t("form.close")}
					footer={
						<>
							<Button variant="primary" onPress={confirmReplace}>
								{t("form.fields.spatial_footprint_map.replace_confirm")}
							</Button>
							<Button variant="outline" onPress={() => setPendingReplace(null)}>
								{t("form.fields.spatial_footprint_map.replace_cancel")}
							</Button>
						</>
					}
				>
					<p>{t("form.fields.spatial_footprint_map.replace_text")}</p>
				</Dialog>
			)}
			{pendingWarning && (
				<Dialog
					isOpen
					onOpenChange={(open) => {
						if (!open) cancelWarning();
					}}
					title={t("form.fields.spatial_footprint_map.outside_division_title")}
					closeLabel={t("form.close")}
					footer={
						<>
							<Button variant="primary" onPress={confirmWarning}>
								{t(
									"form.fields.spatial_footprint_map.outside_division_confirm",
								)}
							</Button>
							<Button variant="outline" onPress={cancelWarning}>
								{t("form.fields.spatial_footprint_map.outside_division_cancel")}
							</Button>
						</>
					}
				>
					<p>{pendingWarning.text}</p>
				</Dialog>
			)}
		</div>
	);
}
