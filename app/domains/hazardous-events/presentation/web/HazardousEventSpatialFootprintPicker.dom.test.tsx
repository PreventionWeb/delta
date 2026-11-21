import {
	describe,
	it,
	expect,
	vi,
	beforeEach,
	afterEach,
	beforeAll,
} from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import type { TranslationGetter } from "~/utils/translator";

// useViewContext() (for ctx.url()'s lang-prefixed fetch URLs) needs both a stubbed root loader
// data and a global translation getter -- same stubs HazardousEventFormPage.dom.test.tsx uses.
const stubTranslationGetter: TranslationGetter = (params) => ({
	msg: params.msg ?? params.code,
});
vi.mock("react-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router")>();
	return {
		...actual,
		useRouteLoaderData: vi.fn(() => ({ common: { lang: "en", user: null } })),
	};
});

// jsdom tier -- needs a real <form>/FormData and DOM interaction.
//
// Both dialog-owning siblings (the Add dialog and the direct-Edit map dialog) are mocked as
// plain inline stand-ins, not real Dialogs -- unlike HazardousEventSpatialFootprintEntryDialog's
// own test, nothing else in this file's tree is ever a real RAC overlay open at the same time, so
// there is no outside-click/aria-hide conflict to guard against here.
vi.mock("./HazardousEventSpatialFootprintEntryDialog", () => ({
	HazardousEventSpatialFootprintEntryDialog: (props: {
		isOpen: boolean;
		onApply: (result: unknown) => void;
		onDismiss: () => void;
		initial?: { kind: string; divisionIds?: readonly string[] } | null;
	}) => {
		if (!props.isOpen) return null;
		return (
			<div data-testid="mock-entry-dialog">
				<span data-testid="mock-entry-initial">
					{props.initial
						? `${props.initial.kind}:${props.initial.divisionIds?.join(",") ?? ""}`
						: "none"}
				</span>
				<button
					type="button"
					onClick={() =>
						props.onApply({
							kind: "divisions",
							divisionIds: ["div-3", "div-4"],
						})
					}
				>
					apply-div-3-and-4
				</button>
				<button
					type="button"
					onClick={() =>
						props.onApply({ kind: "divisions", divisionIds: ["div-1"] })
					}
				>
					apply-div-1-only
				</button>
				<button
					type="button"
					onClick={() =>
						props.onApply({
							kind: "map",
							geometry: { type: "Point", coordinates: [1, 2] },
						})
					}
				>
					apply-map
				</button>
				<button
					type="button"
					onClick={() =>
						props.onApply({
							kind: "divisions",
							divisionIds: ["div-1", "div-2"],
						})
					}
				>
					apply-divisions
				</button>
				<button type="button" onClick={props.onDismiss}>
					dismiss-entry-dialog
				</button>
			</div>
		);
	},
}));

// Non-caching fetchDivisionTree -- the real cache is already covered by divisionTree.test.ts.
// findNode/DivisionTreeNode stay real.
vi.mock("./divisionTree", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./divisionTree")>();
	return {
		...actual,
		fetchDivisionTree: (url: string) =>
			fetch(url, { method: "GET" }).then((response) => response.json()),
	};
});

vi.mock("./HazardousEventSpatialFootprintMapDialog", () => ({
	HazardousEventSpatialFootprintMapDialog: (props: {
		isOpen: boolean;
		initialGeometries: readonly unknown[];
		onSave: (geometries: readonly unknown[]) => void;
		onCancel: () => void;
	}) => {
		if (!props.isOpen) return null;
		return (
			<div data-testid="mock-edit-map-dialog">
				<span data-testid="mock-edit-map-initial-count">
					{props.initialGeometries.length}
				</span>
				<button
					type="button"
					onClick={() => props.onSave([{ type: "Point", coordinates: [9, 9] }])}
				>
					save-edit
				</button>
				<button type="button" onClick={() => props.onSave([])}>
					save-empty-edit
				</button>
				<button type="button" onClick={props.onCancel}>
					cancel-edit
				</button>
			</div>
		);
	},
}));

async function importPicker() {
	return await import("./HazardousEventSpatialFootprintPicker");
}

const hazardousEvents = {
	form: {
		close: "Close",
		spatial_footprint: {
			add_action: "Add",
			preview_action: "Preview map",
			preview_dialog_title: "Map preview",
			row_edit_action: "Edit",
			row_delete_action: "Delete",
			row_edit: "Edit {{label}}",
			row_delete: "Delete {{label}}",
			table: {
				columns: { option: "Option", value: "Value", actions: "Action" },
			},
			entry_dialog: {
				map_option: "Map coordinates",
				division_option: "Geographic level",
			},
			division_dialog: {
				unknown_division: "Unknown division ({{id}})",
			},
		},
	},
	detail: {
		fields: { spatial_footprint: "Spatial footprint" },
		spatial_observation: { map_label: "Spatial footprint map" },
	},
};

let testI18n: I18n;

beforeAll(async () => {
	testI18n = i18n.createInstance();
	await testI18n.use(initReactI18next).init({
		lng: "en",
		fallbackLng: "en",
		ns: ["hazardous-events"],
		defaultNS: "hazardous-events",
		// i18next's default escaping, as at runtime -- catches "/" in labels becoming &#x2F;.
		resources: { en: { "hazardous-events": hazardousEvents } },
	});
	// Warm the cold module compile once (seconds under load), so no single test absorbs it.
	await importPicker();
}, 60000);

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 404) {
	return { ok, status, json: async () => body } as Response;
}

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn());
	vi.stubGlobal(
		"createTranslationGetter",
		(_lang: string) => stubTranslationGetter,
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function renderInForm(ui: React.ReactElement) {
	return render(
		<I18nextProvider i18n={testI18n}>
			<form>{ui}</form>
		</I18nextProvider>,
	);
}

function hiddenValue(container: HTMLElement, name: string): string | null {
	const input = container.querySelector(`input[name="${name}"]`);
	return input instanceof HTMLInputElement ? input.value : null;
}

const user = userEvent.setup();

describe("HazardousEventSpatialFootprintPicker", () => {
	it("renders the hidden spatialObservation/spatialObservationChanged fields as real <form> descendants, reachable via FormData", async () => {
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		const { container } = renderInForm(
			<HazardousEventSpatialFootprintPicker />,
		);

		const form = container.querySelector("form") as HTMLFormElement;
		const formData = new FormData(form);
		expect(formData.get("spatialObservation")).toBe("");
		expect(formData.get("spatialObservationChanged")).toBe("0");
	});

	it("an untouched picker shows a header-only table, an enabled Add action, and a disabled Preview map action", async () => {
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		renderInForm(<HazardousEventSpatialFootprintPicker />);

		// Header row only -- legacy shows no empty-state text.
		expect(screen.getAllByRole("row")).toHaveLength(1);
		expect(
			(screen.getByRole("button", { name: "Add" }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
		expect(
			(
				screen.getByRole("button", {
					name: "Preview map",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		expect(screen.queryByTestId("mock-entry-dialog")).toBeNull();
	});

	it("one geometry and one division produce exactly two rows, each labelled correctly, with the right per-row actions", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(
			jsonResponse([
				{
					id: "div-1",
					parentId: null,
					name: "Zinjibar",
					children: [],
					has_children: false,
					hiddenData: {},
					path: "Abyan Governorate / Zinjibar",
					ids: "div-1",
				},
			]),
		);
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		renderInForm(
			<HazardousEventSpatialFootprintPicker
				currentSpatialObservation={{
					geometries: [{ type: "Point", coordinates: [1, 2] }],
					divisionIds: ["div-1"],
				}}
			/>,
		);

		expect(screen.getByText("Shape: Point — Lat 2, Lng 1")).toBeTruthy();
		expect(
			await screen.findByText("Abyan Governorate / Zinjibar"),
		).toBeTruthy();

		const rows = screen.getAllByRole("row").slice(1); // drop the header row
		expect(rows).toHaveLength(2);

		const geometryRow = rows.find((row) =>
			row.textContent?.includes("Shape: Point"),
		);
		expect(
			geometryRow?.querySelector(
				'[aria-label="Edit Shape: Point — Lat 2, Lng 1"]',
			),
		).not.toBeNull();

		const divisionRow = rows.find((row) =>
			row.textContent?.includes("Abyan Governorate / Zinjibar"),
		);
		// Division rows get Edit too, as in legacy -- and the "/" stays unescaped.
		expect(
			divisionRow?.querySelector(
				'[aria-label="Edit Abyan Governorate / Zinjibar"]',
			),
		).not.toBeNull();
		expect(
			divisionRow?.querySelector(
				'[aria-label="Delete Abyan Governorate / Zinjibar"]',
			),
		).not.toBeNull();

		// Legacy's Option column identifies each row's item type.
		expect(geometryRow?.textContent).toContain("Map coordinates");
		expect(divisionRow?.textContent).toContain("Geographic level");
	});

	it("a division row's Edit opens legacy's 'Edit item' dialog pre-filled with only that division, and Apply replaces it in place", async () => {
		// Empty tree -- rows fall back to the unknown-division label.
		vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		const { container } = renderInForm(
			<HazardousEventSpatialFootprintPicker
				currentSpatialObservation={{
					geometries: [],
					divisionIds: ["div-1", "div-2"],
				}}
			/>,
		);

		await user.click(
			screen.getByRole("button", { name: "Edit Unknown division (div-1)" }),
		);
		expect(screen.getByTestId("mock-entry-initial").textContent).toBe(
			"divisions:div-1",
		);

		await user.click(screen.getByText("apply-div-3-and-4"));

		expect(screen.queryByTestId("mock-entry-dialog")).toBeNull();
		expect(
			JSON.parse(hiddenValue(container, "spatialObservation") ?? ""),
		).toEqual({ geometries: [], divisionIds: ["div-3", "div-4", "div-2"] });
		expect(hiddenValue(container, "spatialObservationChanged")).toBe("1");
	});

	it("cancelling a division row's Edit, or applying it unchanged, leaves the row as-is", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		const { container } = renderInForm(
			<HazardousEventSpatialFootprintPicker
				currentSpatialObservation={{
					geometries: [],
					divisionIds: ["div-1", "div-2"],
				}}
			/>,
		);
		const editDiv1 = () =>
			screen.getByRole("button", { name: "Edit Unknown division (div-1)" });

		await user.click(editDiv1());
		await user.click(screen.getByText("dismiss-entry-dialog"));

		await user.click(editDiv1());
		await user.click(screen.getByText("apply-div-1-only"));

		// Untouched: still the prefill, not flagged as changed.
		expect(hiddenValue(container, "spatialObservationChanged")).toBe("0");
		expect(screen.getAllByRole("row")).toHaveLength(3);
	});

	it("switching a division row's Edit to Map coordinates turns that row into a geometry row", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		const { container } = renderInForm(
			<HazardousEventSpatialFootprintPicker
				currentSpatialObservation={{
					geometries: [],
					divisionIds: ["div-1", "div-2"],
				}}
			/>,
		);

		await user.click(
			screen.getByRole("button", { name: "Edit Unknown division (div-1)" }),
		);
		await user.click(screen.getByText("apply-map"));

		expect(
			JSON.parse(hiddenValue(container, "spatialObservation") ?? ""),
		).toEqual({
			geometries: [{ type: "Point", coordinates: [1, 2] }],
			divisionIds: ["div-2"],
		});
	});

	it("Preview map is enabled once at least one row exists", async () => {
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		renderInForm(
			<HazardousEventSpatialFootprintPicker
				currentSpatialObservation={{
					geometries: [{ type: "Point", coordinates: [1, 2] }],
					divisionIds: [],
				}}
			/>,
		);

		expect(
			(
				screen.getByRole("button", {
					name: "Preview map",
				}) as HTMLButtonElement
			).disabled,
		).toBe(false);
	});

	it("clicking Add opens the Add dialog; applying a map result appends one geometry row and marks the observation changed", async () => {
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		const { container } = renderInForm(
			<HazardousEventSpatialFootprintPicker />,
		);

		await user.click(screen.getByRole("button", { name: "Add" }));
		expect(screen.getByTestId("mock-entry-dialog")).toBeTruthy();

		await user.click(screen.getByText("apply-map"));

		expect(screen.queryByTestId("mock-entry-dialog")).toBeNull();
		expect(screen.getByText("Shape: Point — Lat 2, Lng 1")).toBeTruthy();
		expect(hiddenValue(container, "spatialObservationChanged")).toBe("1");
		const raw = hiddenValue(container, "spatialObservation");
		expect(JSON.parse(raw as string)).toEqual({
			geometries: [{ type: "Point", coordinates: [1, 2] }],
			divisionIds: [],
		});
	});

	it("applying a divisions result with two ids adds two independent rows at once", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(jsonResponse([]));
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		const { container } = renderInForm(
			<HazardousEventSpatialFootprintPicker />,
		);

		await user.click(screen.getByRole("button", { name: "Add" }));
		await user.click(screen.getByText("apply-divisions"));

		const raw = hiddenValue(container, "spatialObservation");
		expect(JSON.parse(raw as string).divisionIds).toEqual(["div-1", "div-2"]);
		const rows = screen.getAllByRole("row").slice(1);
		expect(rows).toHaveLength(2);
	});

	it("applying a divisions result that duplicates every already-committed division keeps the Add dialog open, not closed as if it had worked", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(jsonResponse([]));
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		renderInForm(
			<HazardousEventSpatialFootprintPicker
				currentSpatialObservation={{
					geometries: [],
					divisionIds: ["div-1", "div-2"],
				}}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Add" }));
		await user.click(screen.getByText("apply-divisions"));

		expect(screen.getByTestId("mock-entry-dialog")).toBeTruthy();
		const rows = screen.getAllByRole("row").slice(1);
		expect(rows).toHaveLength(2);
	});

	it("dismissing the Add dialog before applying leaves the row table unchanged", async () => {
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		renderInForm(<HazardousEventSpatialFootprintPicker />);

		await user.click(screen.getByRole("button", { name: "Add" }));
		await user.click(screen.getByText("dismiss-entry-dialog"));

		// Header row only -- legacy shows no empty-state text.
		expect(screen.getAllByRole("row")).toHaveLength(1);
	});

	it("a geometry row's Edit action opens the map tool directly, pre-loaded with only that row's geometry, and Save replaces it in place", async () => {
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		const { container } = renderInForm(
			<HazardousEventSpatialFootprintPicker
				currentSpatialObservation={{
					geometries: [
						{ type: "Point", coordinates: [1, 2] },
						{ type: "Point", coordinates: [3, 4] },
					],
					divisionIds: [],
				}}
			/>,
		);

		await user.click(
			screen.getByRole("button", { name: "Edit Shape: Point — Lat 4, Lng 3" }),
		);

		expect(screen.getByTestId("mock-edit-map-dialog")).toBeTruthy();
		expect(screen.getByTestId("mock-edit-map-initial-count").textContent).toBe(
			"1",
		);

		await user.click(screen.getByText("save-edit"));

		const raw = hiddenValue(container, "spatialObservation");
		expect(JSON.parse(raw as string).geometries).toEqual([
			{ type: "Point", coordinates: [1, 2] },
			{ type: "Point", coordinates: [9, 9] },
		]);
	});

	it("saving an empty result during Edit removes that row entirely", async () => {
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		const { container } = renderInForm(
			<HazardousEventSpatialFootprintPicker
				currentSpatialObservation={{
					geometries: [{ type: "Point", coordinates: [1, 2] }],
					divisionIds: [],
				}}
			/>,
		);

		await user.click(
			screen.getByRole("button", { name: "Edit Shape: Point — Lat 2, Lng 1" }),
		);
		await user.click(screen.getByText("save-empty-edit"));

		// Header row only -- legacy shows no empty-state text.
		expect(screen.getAllByRole("row")).toHaveLength(1);
		expect(hiddenValue(container, "spatialObservation")).toBe("");
	});

	it("cancelling an Edit session leaves the row unchanged", async () => {
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		renderInForm(
			<HazardousEventSpatialFootprintPicker
				currentSpatialObservation={{
					geometries: [{ type: "Point", coordinates: [1, 2] }],
					divisionIds: [],
				}}
			/>,
		);

		await user.click(
			screen.getByRole("button", { name: "Edit Shape: Point — Lat 2, Lng 1" }),
		);
		await user.click(screen.getByText("cancel-edit"));

		expect(screen.getByText("Shape: Point — Lat 2, Lng 1")).toBeTruthy();
	});

	it("a geometry row's Delete action removes it directly, without opening the map tool, and does not submit the form", async () => {
		const submitHandler = vi.fn((e: React.FormEvent) => e.preventDefault());
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		render(
			<I18nextProvider i18n={testI18n}>
				<form onSubmit={submitHandler}>
					<HazardousEventSpatialFootprintPicker
						currentSpatialObservation={{
							geometries: [{ type: "Point", coordinates: [1, 2] }],
							divisionIds: [],
						}}
					/>
				</form>
			</I18nextProvider>,
		);

		await user.click(
			screen.getByRole("button", {
				name: "Delete Shape: Point — Lat 2, Lng 1",
			}),
		);

		// Header row only -- legacy shows no empty-state text.
		expect(screen.getAllByRole("row")).toHaveLength(1);
		expect(screen.queryByTestId("mock-edit-map-dialog")).toBeNull();
		expect(submitHandler).not.toHaveBeenCalled();
	});

	it("a division row's Delete action removes it directly, without opening the division dialog", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(
			jsonResponse([
				{
					id: "div-1",
					parentId: null,
					name: "Zinjibar",
					children: [],
					has_children: false,
					hiddenData: {},
					path: "Abyan Governorate / Zinjibar",
					ids: "div-1",
				},
			]),
		);
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		renderInForm(
			<HazardousEventSpatialFootprintPicker
				currentSpatialObservation={{ geometries: [], divisionIds: ["div-1"] }}
			/>,
		);

		const deleteButton = await screen.findByRole("button", {
			name: "Delete Abyan Governorate / Zinjibar",
		});
		await user.click(deleteButton);

		// Header row only -- legacy shows no empty-state text.
		expect(screen.getAllByRole("row")).toHaveLength(1);
	});

	it("reverts the hidden fields to their untouched values once every row is removed after an interaction", async () => {
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		const { container } = renderInForm(
			<HazardousEventSpatialFootprintPicker />,
		);

		await user.click(screen.getByRole("button", { name: "Add" }));
		await user.click(screen.getByText("apply-map"));
		expect(hiddenValue(container, "spatialObservationChanged")).toBe("1");

		await user.click(
			screen.getByRole("button", {
				name: "Delete Shape: Point — Lat 2, Lng 1",
			}),
		);

		expect(hiddenValue(container, "spatialObservation")).toBe("");
		expect(hiddenValue(container, "spatialObservationChanged")).toBe("0");
	});

	it("Preview map opens a dialog containing the read-only map, fed geometries plus every selected division's boundary", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockImplementation((url) =>
			Promise.resolve(
				String(url).includes("/api/division/tree")
					? jsonResponse([])
					: jsonResponse({
							geojson: { type: "Polygon", coordinates: [[[0, 0]]] },
							name: "Div One",
						}),
			),
		);
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		renderInForm(
			<HazardousEventSpatialFootprintPicker
				currentSpatialObservation={{
					geometries: [{ type: "Point", coordinates: [1, 2] }],
					divisionIds: ["div-1"],
				}}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Preview map" }));

		const dialog = await screen.findByRole("dialog");
		expect(
			await screen.findByRole("region", { name: "Spatial footprint map" }),
		).toBeTruthy();
		// Legacy's full-page "Map preview", as the same full-screen panel as the Mapper.
		expect(screen.getByRole("heading", { name: "Map preview" })).toBeTruthy();
		expect(dialog.parentElement?.className).toContain("inset-0");
		const geojsonCalls = fetchMock.mock.calls.filter(([url]) =>
			String(url).includes("/api/geojson/div-1"),
		);
		expect(geojsonCalls).toHaveLength(1);
	});

	it("prefills from an edit-mode observation into real rows immediately, with spatialObservationChanged starting at '0'", async () => {
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		const { container } = renderInForm(
			<HazardousEventSpatialFootprintPicker
				currentSpatialObservation={{
					geometries: [{ type: "Point", coordinates: [3, 4] }],
					divisionIds: [],
				}}
			/>,
		);

		expect(screen.getByText("Shape: Point — Lat 4, Lng 3")).toBeTruthy();
		expect(hiddenValue(container, "spatialObservationChanged")).toBe("0");
	});

	it("resolves a prefilled division row's breadcrumb path via a single division-tree fetch", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(
			jsonResponse([
				{
					id: "div-1",
					parentId: null,
					name: "Zinjibar",
					children: [],
					has_children: false,
					hiddenData: {},
					path: "Abyan Governorate / Zinjibar",
					ids: "div-1",
				},
			]),
		);
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		renderInForm(
			<HazardousEventSpatialFootprintPicker
				currentSpatialObservation={{ geometries: [], divisionIds: ["div-1"] }}
			/>,
		);

		expect(
			await screen.findByText("Abyan Governorate / Zinjibar"),
		).toBeTruthy();
		const treeCalls = fetchMock.mock.calls.filter(([url]) =>
			String(url).includes("/api/division/tree"),
		);
		expect(treeCalls).toHaveLength(1);
	});

	it("a division no longer present in a fresh tree fetch falls back to the unknown-division label, not a crash", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(jsonResponse([]));
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		renderInForm(
			<HazardousEventSpatialFootprintPicker
				currentSpatialObservation={{
					geometries: [],
					divisionIds: ["div-gone"],
				}}
			/>,
		);

		expect(await screen.findByText("Unknown division (div-gone)")).toBeTruthy();
	});

	it("renders a ValidationError-style errors prop as inline field errors under the widget", async () => {
		const { HazardousEventSpatialFootprintPicker } = await importPicker();
		renderInForm(
			<HazardousEventSpatialFootprintPicker
				errors={["divisionIds must not contain duplicate values"]}
			/>,
		);

		const list = screen
			.getByText("divisionIds must not contain duplicate values")
			.closest("ul");
		expect(list).not.toBeNull();
		expect(list?.className).toContain("dts-field-error-list");
	});
});
