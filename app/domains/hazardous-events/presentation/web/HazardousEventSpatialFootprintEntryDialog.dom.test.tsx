import {
	describe,
	it,
	expect,
	vi,
	beforeAll,
	beforeEach,
	afterEach,
} from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import type { TranslationGetter } from "~/utils/translator";

// useViewContext() (for the division-tree fetch URL) needs a stubbed root loader and a global
// translation getter -- same stubs HazardousEventSpatialFootprintPicker.dom.test.tsx uses.
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

// Both mocks render through the real design-system Dialog, not a plain portaled div -- the real
// components each own a nested RAC overlay, and only a real registered overlay stays clickable
// once nested inside the already-open Add dialog (react-aria's topmost-overlay click capture
// otherwise swallows clicks on anything that isn't itself a registered overlay).
vi.mock("./HazardousEventSpatialFootprintMapDialog", async () => {
	const { Dialog } = await import("~/design-system/components/Dialog");
	return {
		HazardousEventSpatialFootprintMapDialog: (props: {
			isOpen: boolean;
			initialGeometries: readonly unknown[];
			onSave: (geometries: readonly unknown[]) => void;
			onCancel: () => void;
		}) => (
			<Dialog
				isOpen={props.isOpen}
				onOpenChange={(open) => {
					if (!open) props.onCancel();
				}}
				title="Map coordinates"
				closeLabel="Close"
			>
				<div data-testid="mock-map-dialog">
					<span data-testid="mock-map-dialog-count">
						{props.initialGeometries.length}
					</span>
					<button
						type="button"
						onClick={() =>
							props.onSave([{ type: "Point", coordinates: [1, 2] }])
						}
					>
						save-shape
					</button>
					<button type="button" onClick={props.onCancel}>
						cancel-map
					</button>
				</div>
			</Dialog>
		),
	};
});

vi.mock("./HazardousEventDivisionListDialog", async () => {
	const { Dialog } = await import("~/design-system/components/Dialog");
	const { useEffect, useState } = await import("react");
	// Stages picks locally like the real tree; "close-division-dialog" is its Apply.
	function MockDivisionListDialog(props: {
		isOpen: boolean;
		initialSelectedIds: readonly string[];
		onApply: (ids: readonly string[]) => void;
		onDiscard: () => void;
	}) {
		const [staged, setStaged] = useState<readonly string[]>([]);
		useEffect(() => {
			if (props.isOpen) setStaged(props.initialSelectedIds);
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [props.isOpen]);
		return (
			<Dialog
				isOpen={props.isOpen}
				onOpenChange={(open) => {
					if (!open) props.onDiscard();
				}}
				title="Geographic level"
				closeLabel="Close"
			>
				<div data-testid="mock-division-dialog">
					<span data-testid="mock-division-initial">
						{props.initialSelectedIds.join(",")}
					</span>
					<button
						type="button"
						onClick={() => setStaged((prev) => [...prev, "div-1"])}
					>
						select-div-1
					</button>
					<button
						type="button"
						onClick={() => setStaged((prev) => [...prev, "div-2"])}
					>
						select-div-2
					</button>
					<button type="button" onClick={() => props.onApply(staged)}>
						close-division-dialog
					</button>
					<button type="button" onClick={props.onDiscard}>
						discard-division-dialog
					</button>
				</div>
			</Dialog>
		);
	}
	return { HazardousEventDivisionListDialog: MockDivisionListDialog };
});

import { HazardousEventSpatialFootprintEntryDialog } from "./HazardousEventSpatialFootprintEntryDialog";

const hazardousEvents = {
	form: {
		close: "Close",
		spatial_footprint: {
			entry_dialog: {
				title: "Add new item",
				edit_title: "Edit item",
				item_type: "Item type",
				map_option: "Map coordinates",
				division_option: "Geographic level",
				open_map_action: "Open map",
				select_action: "Select",
				division_placeholder: "Select geographic level",
				apply: "Apply",
				cancel: "Cancel",
			},
			division_dialog: { unknown_division: "Unknown division ({{id}})" },
		},
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
		resources: { en: { "hazardous-events": hazardousEvents } },
	});
});

const user = userEvent.setup();

beforeEach(() => {
	vi.stubGlobal(
		"createTranslationGetter",
		(_lang: string) => stubTranslationGetter,
	);
	// One-node tree so staged divisions resolve to a breadcrumb path.
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => [
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
			],
		})),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

// Text of every node removed while `update` runs -- a stale first frame shows up here even
// though the final DOM is correct.
function removedTextDuring(update: () => void): string {
	const observer = new MutationObserver(() => {});
	observer.observe(document.body, { childList: true, subtree: true });
	update();
	const removed = observer
		.takeRecords()
		.flatMap((record) => [...record.removedNodes])
		.map((node) => node.textContent ?? "")
		.join("|");
	observer.disconnect();
	return removed;
}

function renderDialog(
	onApply: (result: unknown) => void = () => {},
	onDismiss: () => void = () => {},
) {
	return render(
		<I18nextProvider i18n={testI18n}>
			<HazardousEventSpatialFootprintEntryDialog
				isOpen
				previewDivisions={[]}
				onApply={onApply}
				onDismiss={onDismiss}
			/>
		</I18nextProvider>,
	);
}

describe("HazardousEventSpatialFootprintEntryDialog", () => {
	it("renders the Item-type radio with no Title field anywhere in the dialog", () => {
		renderDialog();

		expect(screen.getByRole("radio", { name: "Map coordinates" })).toBeTruthy();
		expect(
			screen.getByRole("radio", { name: "Geographic level" }),
		).toBeTruthy();
		expect(screen.queryByLabelText(/title/i)).toBeNull();
		expect(screen.queryByText(/title/i)).toBeNull();
	});

	it("opens with Map coordinates pre-selected, as legacy does, and Apply disabled until a shape is saved", () => {
		renderDialog();

		expect(
			(
				screen.getByRole("radio", {
					name: "Map coordinates",
				}) as HTMLInputElement
			).checked,
		).toBe(true);
		expect(screen.getByRole("button", { name: "Open map" })).toBeTruthy();
		expect(
			(screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	it("selecting Map coordinates reveals an Open map trigger, not the division field", async () => {
		renderDialog();

		await user.click(screen.getByRole("radio", { name: "Map coordinates" }));

		expect(screen.getByRole("button", { name: "Open map" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Select" })).toBeNull();
	});

	it("each read-only field is named by its card caption, not its button's label, keeping the placeholder", async () => {
		renderDialog();

		const mapField = screen.getByRole("textbox", {
			name: "Map coordinates",
		}) as HTMLInputElement;
		expect(mapField.placeholder).toBe("Open map");

		await user.click(screen.getByRole("radio", { name: "Geographic level" }));
		const divisionField = screen.getByRole("textbox", {
			name: "Geographic level",
		}) as HTMLInputElement;
		expect(divisionField.placeholder).toBe("Select geographic level");
	});

	it("selecting Geographic level reveals a Select trigger, not the map field", async () => {
		renderDialog();

		await user.click(screen.getByRole("radio", { name: "Geographic level" }));

		expect(screen.getByRole("button", { name: "Select" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Open map" })).toBeNull();
	});

	it("Apply stays disabled for Map coordinates until a shape has been saved in this session", async () => {
		renderDialog();

		await user.click(screen.getByRole("radio", { name: "Map coordinates" }));

		expect(
			(screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	it("opening the map tool, saving a shape, shows the Shape summary inline and enables Apply", async () => {
		renderDialog();

		await user.click(screen.getByRole("radio", { name: "Map coordinates" }));
		await user.click(screen.getByRole("button", { name: "Open map" }));
		await user.click(screen.getByText("save-shape"));

		expect(screen.getByText(/Shape: Point/)).toBeTruthy();
		expect(
			(screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
		expect(screen.queryByTestId("mock-map-dialog")).toBeNull();
	});

	it("a summary with repeated corner lines (a closed line) renders each one, without React key clashes", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		render(
			<I18nextProvider i18n={testI18n}>
				<HazardousEventSpatialFootprintEntryDialog
					isOpen
					initial={{
						kind: "map",
						geometry: {
							type: "LineString",
							coordinates: [
								[1, 2],
								[3, 4],
								[1, 2],
							],
						},
					}}
					previewDivisions={[]}
					onApply={() => {}}
					onDismiss={() => {}}
				/>
			</I18nextProvider>,
		);

		expect(screen.getAllByText("Lat 2, Lng 1")).toHaveLength(2);
		expect(
			consoleError.mock.calls.some((call) =>
				String(call[0]).includes("same key"),
			),
		).toBe(false);
		consoleError.mockRestore();
	});

	it("switching away from Map coordinates and back clears the previously staged shape summary", async () => {
		renderDialog();

		await user.click(screen.getByRole("radio", { name: "Map coordinates" }));
		await user.click(screen.getByRole("button", { name: "Open map" }));
		await user.click(screen.getByText("save-shape"));
		expect(screen.getByText(/Shape: Point/)).toBeTruthy();

		await user.click(screen.getByRole("radio", { name: "Geographic level" }));
		await user.click(screen.getByRole("radio", { name: "Map coordinates" }));

		expect(screen.queryByText(/Shape: Point/)).toBeNull();
		expect(
			(screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	it("Apply after saving a shape calls onApply with the map result", async () => {
		const onApply = vi.fn();
		renderDialog(onApply);

		await user.click(screen.getByRole("radio", { name: "Map coordinates" }));
		await user.click(screen.getByRole("button", { name: "Open map" }));
		await user.click(screen.getByText("save-shape"));
		await user.click(screen.getByRole("button", { name: "Apply" }));

		expect(onApply).toHaveBeenCalledWith({
			kind: "map",
			geometry: { type: "Point", coordinates: [1, 2] },
		});
	});

	it("cancelling the nested map tool leaves Apply disabled -- nothing was saved in this session", async () => {
		renderDialog();

		await user.click(screen.getByRole("radio", { name: "Map coordinates" }));
		await user.click(screen.getByRole("button", { name: "Open map" }));
		await user.click(screen.getByText("cancel-map"));

		expect(
			(screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	it("selecting Select, choosing two divisions, and Apply calls onApply with both ids", async () => {
		const onApply = vi.fn();
		renderDialog(onApply);

		await user.click(screen.getByRole("radio", { name: "Geographic level" }));
		await user.click(screen.getByRole("button", { name: "Select" }));
		await user.click(screen.getByText("select-div-1"));
		await user.click(screen.getByText("select-div-2"));
		await user.click(screen.getByText("close-division-dialog"));
		await user.click(screen.getByRole("button", { name: "Apply" }));

		expect(onApply).toHaveBeenCalledWith({
			kind: "divisions",
			divisionIds: ["div-1", "div-2"],
		});
	});

	it("staged divisions show in the read-only field by breadcrumb path, or the unknown-division label", async () => {
		renderDialog();

		await user.click(screen.getByRole("radio", { name: "Geographic level" }));
		await user.click(screen.getByRole("button", { name: "Select" }));
		await user.click(screen.getByText("select-div-1"));
		await user.click(screen.getByText("select-div-2"));
		await user.click(screen.getByText("close-division-dialog"));

		const field = screen.getByRole("textbox", {
			name: "Geographic level",
		}) as HTMLInputElement;
		// div-2 isn't in the stub tree -- same label the rows and chips use, never dropped.
		expect(
			await screen.findByDisplayValue(
				"Abyan Governorate / Zinjibar, Unknown division (div-2)",
			),
		).toBe(field);
	});

	it("dismissing via Escape before Apply calls onDismiss, not onApply, discarding anything staged", async () => {
		const onApply = vi.fn();
		const onDismiss = vi.fn();
		renderDialog(onApply, onDismiss);

		await user.click(screen.getByRole("radio", { name: "Map coordinates" }));
		await user.click(screen.getByRole("button", { name: "Open map" }));
		await user.click(screen.getByText("save-shape"));

		fireEvent.keyDown(screen.getByRole("dialog"), {
			key: "Escape",
			code: "Escape",
		});

		expect(onApply).not.toHaveBeenCalled();
		expect(onDismiss).toHaveBeenCalled();
	});

	it("dismissing via the header close button before Apply calls onDismiss, not onApply", async () => {
		const onApply = vi.fn();
		const onDismiss = vi.fn();
		renderDialog(onApply, onDismiss);

		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(onApply).not.toHaveBeenCalled();
		expect(onDismiss).toHaveBeenCalled();
	});

	it("the footer's explicit Cancel button discards anything staged, matching legacy's own Apply/Cancel footer", async () => {
		const onApply = vi.fn();
		const onDismiss = vi.fn();
		renderDialog(onApply, onDismiss);

		await user.click(screen.getByRole("radio", { name: "Map coordinates" }));
		await user.click(screen.getByRole("button", { name: "Open map" }));
		await user.click(screen.getByText("save-shape"));

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(onApply).not.toHaveBeenCalled();
		expect(onDismiss).toHaveBeenCalled();
	});

	it("opening for Edit shows the division field in its very first frame -- never the default map field", () => {
		const view = (isOpen: boolean) => (
			<I18nextProvider i18n={testI18n}>
				<HazardousEventSpatialFootprintEntryDialog
					isOpen={isOpen}
					initial={
						isOpen ? { kind: "divisions", divisionIds: ["div-1"] } : null
					}
					previewDivisions={[]}
					onApply={() => {}}
					onDismiss={() => {}}
				/>
			</I18nextProvider>
		);
		const { rerender } = render(view(false));

		const removed = removedTextDuring(() => rerender(view(true)));

		expect(removed).not.toContain("Open map");
		expect(screen.getByRole("button", { name: "Select" })).toBeTruthy();
	});

	it("with `initial`, opens as legacy's 'Edit item', pre-filled with that division", async () => {
		render(
			<I18nextProvider i18n={testI18n}>
				<HazardousEventSpatialFootprintEntryDialog
					isOpen
					initial={{ kind: "divisions", divisionIds: ["div-1"] }}
					previewDivisions={[]}
					onApply={() => {}}
					onDismiss={() => {}}
				/>
			</I18nextProvider>,
		);

		expect(screen.getByRole("heading", { name: "Edit item" })).toBeTruthy();
		expect(
			(
				screen.getByRole("radio", {
					name: "Geographic level",
				}) as HTMLInputElement
			).checked,
		).toBe(true);
		expect(
			await screen.findByDisplayValue("Abyan Governorate / Zinjibar"),
		).toBeTruthy();

		await user.click(screen.getByRole("button", { name: "Select" }));
		expect(screen.getByTestId("mock-division-initial").textContent).toBe(
			"div-1",
		);
	});

	it("Discard in the division tree keeps the previously staged picks", async () => {
		const onApply = vi.fn();
		renderDialog(onApply);

		await user.click(screen.getByRole("radio", { name: "Geographic level" }));
		await user.click(screen.getByRole("button", { name: "Select" }));
		await user.click(screen.getByText("select-div-1"));
		await user.click(screen.getByText("close-division-dialog"));

		await user.click(screen.getByRole("button", { name: "Select" }));
		await user.click(screen.getByText("select-div-2"));
		await user.click(screen.getByText("discard-division-dialog"));
		await user.click(screen.getByRole("button", { name: "Apply" }));

		expect(onApply).toHaveBeenCalledWith({
			kind: "divisions",
			divisionIds: ["div-1"],
		});
	});
});
