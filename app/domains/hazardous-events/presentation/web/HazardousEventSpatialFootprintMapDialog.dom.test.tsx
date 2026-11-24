import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";

// Mocked, not the real Leaflet map -- this file only exercises the dialog's open/save/discard
// wiring, not real draw interaction (covered by HazardousEventSpatialFootprintMap.dom.test.tsx).
// The real map owns Save Coordinates; "save-drawn" stands in for it.
vi.mock("./HazardousEventSpatialFootprintMap", () => ({
	HazardousEventSpatialFootprintMap: (props: {
		geometries: readonly unknown[];
		onSave: (geometries: readonly unknown[]) => void;
		onDrawActiveChange?: (active: boolean) => void;
	}) => (
		<div data-testid="mock-map">
			<span data-testid="mock-map-count">{props.geometries.length}</span>
			<button
				type="button"
				onClick={() =>
					props.onSave([
						...props.geometries,
						{ type: "Point", coordinates: [1, 2] },
					])
				}
			>
				save-drawn
			</button>
			<button type="button" onClick={() => props.onDrawActiveChange?.(true)}>
				start-draw
			</button>
			<button type="button" onClick={() => props.onDrawActiveChange?.(false)}>
				stop-draw
			</button>
		</div>
	),
}));

import { HazardousEventSpatialFootprintMapDialog } from "./HazardousEventSpatialFootprintMapDialog";

const hazardousEvents = {
	form: {
		close: "Close",
		spatial_footprint: {
			map_dialog: { title: "Mapper" },
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

const user = userEvent.setup();

afterEach(() => {
	cleanup();
});

function renderDialog(props: {
	isOpen: boolean;
	initialGeometries?: readonly unknown[];
	onSave: (geometries: readonly unknown[]) => void;
	onCancel: () => void;
}) {
	return render(
		<I18nextProvider i18n={testI18n}>
			<HazardousEventSpatialFootprintMapDialog
				isOpen={props.isOpen}
				initialGeometries={props.initialGeometries ?? []}
				previewDivisions={[]}
				title="Mapper"
				onSave={props.onSave}
				onCancel={props.onCancel}
			/>
		</I18nextProvider>,
	);
}

describe("HazardousEventSpatialFootprintMapDialog", () => {
	it("renders legacy's full-screen Mapper: its title and a close button, with no Save/Cancel footer", () => {
		renderDialog({ isOpen: true, onSave: vi.fn(), onCancel: vi.fn() });

		expect(screen.getByRole("heading", { name: "Mapper" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
	});

	it("the map's Save Coordinates reaches onSave directly; the dialog never cancels on save", async () => {
		const onSave = vi.fn();
		const onCancel = vi.fn();
		renderDialog({ isOpen: true, onSave, onCancel });

		await user.click(screen.getByText("save-drawn"));

		expect(onSave).toHaveBeenCalledWith([
			{ type: "Point", coordinates: [1, 2] },
		]);
		expect(onCancel).not.toHaveBeenCalled();
	});

	it("the close button discards the session -- onSave is never called", async () => {
		const onSave = vi.fn();
		const onCancel = vi.fn();
		renderDialog({ isOpen: true, onSave, onCancel });

		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(onSave).not.toHaveBeenCalled();
		expect(onCancel).toHaveBeenCalled();
	});

	it("dismissing via Escape, with no draw active, discards the session without calling onSave", async () => {
		const onSave = vi.fn();
		const onCancel = vi.fn();
		renderDialog({ isOpen: true, onSave, onCancel });

		await user.keyboard("{Escape}");

		expect(onSave).not.toHaveBeenCalled();
		expect(onCancel).toHaveBeenCalled();
	});

	it("Escape while a draw is active does not cancel the session -- the dialog stays open", async () => {
		const onSave = vi.fn();
		const onCancel = vi.fn();
		renderDialog({ isOpen: true, onSave, onCancel });

		await user.click(screen.getByText("start-draw"));
		await user.keyboard("{Escape}");

		expect(onCancel).not.toHaveBeenCalled();
		expect(screen.getByTestId("mock-map")).toBeTruthy();
	});

	it("Escape after the draw ends (stop-draw) cancels the session normally again", async () => {
		const onSave = vi.fn();
		const onCancel = vi.fn();
		renderDialog({ isOpen: true, onSave, onCancel });

		await user.click(screen.getByText("start-draw"));
		await user.click(screen.getByText("stop-draw"));
		await user.keyboard("{Escape}");

		expect(onCancel).toHaveBeenCalled();
	});

	it("starts each open from the caller's current initialGeometries, not a stale prior session's buffer", async () => {
		const onSave = vi.fn();
		const onCancel = vi.fn();
		const existing = { type: "Point", coordinates: [9, 9] };
		renderDialog({
			isOpen: true,
			initialGeometries: [existing],
			onSave,
			onCancel,
		});

		expect(screen.getByTestId("mock-map-count").textContent).toBe("1");
	});

	// A mocked map (reading `geometries` straight from props every render) can't reproduce the
	// real mount-timing race between this buffer reset and HazardousEventSpatialFootprintMap's
	// own one-time mount effect -- that regression test lives in
	// HazardousEventSpatialFootprintMap.dom.test.tsx instead, against the real Map component.

	it("renders the full-screen variant, not the old content-sized panel", () => {
		const { baseElement } = renderDialog({
			isOpen: true,
			onSave: vi.fn(),
			onCancel: vi.fn(),
		});

		expect(baseElement.querySelector(".dts-dialog-panel")).toBeNull();
		const panel = screen.getByRole("dialog").parentElement;
		expect(panel?.className).toContain("inset-0");
	});
});
