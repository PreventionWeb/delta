import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "~/design-system/components/Dialog";
import { Button } from "~/design-system/components/Button";
import { HazardousEventSpatialFootprintMapDialog } from "./HazardousEventSpatialFootprintMapDialog";
import { HazardousEventDivisionListDialog } from "./HazardousEventDivisionListDialog";
import { describeGeometryParts } from "./describeGeometry";
import { useDivisionTree, divisionLabel } from "./useDivisionTree";
import type { BareGeometry } from "./spatialFootprintGeometry";
import type { DivisionPreviewEntry } from "./useDivisionBoundaryPreviews";

export type SpatialFootprintItemType = "map" | "divisions";

export type SpatialFootprintAddResult =
	| { kind: "map"; geometry: unknown }
	| { kind: "divisions"; divisionIds: readonly string[] };

export interface HazardousEventSpatialFootprintEntryDialogProps {
	isOpen: boolean;
	previewDivisions: readonly DivisionPreviewEntry[];
	/** Commits this session's staged result. Never called on dismissal without Apply. */
	onApply: (result: SpatialFootprintAddResult) => void;
	onDismiss: () => void;
	/** Pre-fills the dialog as legacy's "Edit item"; omitted for Add. */
	initial?: SpatialFootprintAddResult | null;
}

// Legacy pre-selects "Map coordinates", so a field card always shows.
function initialItemType(
	initial: SpatialFootprintAddResult | null,
): SpatialFootprintItemType {
	return initial?.kind ?? "map";
}

function initialGeometry(initial: SpatialFootprintAddResult | null): unknown {
	return initial?.kind === "map" ? initial.geometry : null;
}

function initialDivisionIds(
	initial: SpatialFootprintAddResult | null,
): readonly string[] {
	return initial?.kind === "divisions" ? initial.divisionIds : [];
}

/** Legacy's bordered field card, copied from its Tailwind classes. */
function FieldCard({
	caption,
	children,
}: {
	caption: string;
	children: ReactNode;
}) {
	return (
		<div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
			<div className="mb-2 text-sm font-medium text-slate-700">{caption}</div>
			{children}
		</div>
	);
}

/** Read-only value joined to its trigger button, as legacy's input group. `label` names the
 * field apart from the button, which would otherwise share the placeholder's text. */
function ValueTrigger({
	label,
	value,
	placeholder,
	actionLabel,
	onPress,
}: {
	label: string;
	value: string;
	placeholder: string;
	actionLabel: string;
	onPress: () => void;
}) {
	return (
		<div className="flex">
			<input
				type="text"
				readOnly
				value={value}
				placeholder={placeholder}
				aria-label={label}
				className="min-w-0 flex-1 rounded-l-md border border-gray-300 bg-white p-3 text-base text-gray-600"
			/>
			<Button
				variant="accent-outline"
				onPress={onPress}
				className="rounded-l-none"
			>
				<i className="pi pi-globe" aria-hidden="true" />
				{actionLabel}
			</Button>
		</div>
	);
}

/** No Title field (CA's data model has none); otherwise legacy's "Add new item" layout. Apply
 * commits the session's staged result into the row table. */
export function HazardousEventSpatialFootprintEntryDialog({
	isOpen,
	previewDivisions,
	onApply,
	onDismiss,
	initial = null,
}: HazardousEventSpatialFootprintEntryDialogProps) {
	const { t } = useTranslation("hazardous-events");
	const [itemType, setItemType] = useState<SpatialFootprintItemType>(
		initialItemType(initial),
	);
	const [stagedGeometry, setStagedGeometry] = useState<unknown | null>(
		initialGeometry(initial),
	);
	const [stagedDivisionIds, setStagedDivisionIds] = useState<readonly string[]>(
		initialDivisionIds(initial),
	);
	const [wasOpen, setWasOpen] = useState(isOpen);
	const [mapDialogOpen, setMapDialogOpen] = useState(false);
	const [divisionsDialogOpen, setDivisionsDialogOpen] = useState(false);

	// Each open starts afresh from `initial`. Reset during render so no frame shows the last
	// session; state, not a ref: StrictMode-safe.
	if (isOpen !== wasOpen) {
		setWasOpen(isOpen);
		if (isOpen) {
			setItemType(initialItemType(initial));
			setStagedGeometry(initialGeometry(initial));
			setStagedDivisionIds(initialDivisionIds(initial));
		}
	}

	const divisionTree = useDivisionTree(stagedDivisionIds.length > 0).tree;

	const applyDisabled =
		(itemType === "map" && stagedGeometry === null) ||
		(itemType === "divisions" && stagedDivisionIds.length === 0);

	function handleApply() {
		if (itemType === "map" && stagedGeometry !== null) {
			onApply({ kind: "map", geometry: stagedGeometry });
		} else if (itemType === "divisions" && stagedDivisionIds.length > 0) {
			onApply({ kind: "divisions", divisionIds: stagedDivisionIds });
		}
	}

	const shape =
		stagedGeometry !== null
			? describeGeometryParts(stagedGeometry as BareGeometry)
			: null;

	const stagedDivisionText = stagedDivisionIds
		.map((id) => divisionLabel(divisionTree, id, t))
		.join(", ");

	const itemTypeOptions: readonly {
		value: SpatialFootprintItemType;
		label: string;
	}[] = [
		{
			value: "map",
			label: t("form.spatial_footprint.entry_dialog.map_option"),
		},
		{
			value: "divisions",
			label: t("form.spatial_footprint.entry_dialog.division_option"),
		},
	];

	return (
		<>
			<Dialog
				variant="item"
				isOpen={isOpen}
				onOpenChange={(open) => {
					if (!open) onDismiss();
				}}
				title={
					initial
						? t("form.spatial_footprint.entry_dialog.edit_title")
						: t("form.spatial_footprint.entry_dialog.title")
				}
				closeLabel={t("form.close")}
				footer={
					<>
						<Button
							variant="accent"
							disabled={applyDisabled}
							onPress={handleApply}
						>
							<i className="pi pi-check" aria-hidden="true" />
							{t("form.spatial_footprint.entry_dialog.apply")}
						</Button>
						<Button variant="muted-outline" onPress={onDismiss}>
							<i className="pi pi-times" aria-hidden="true" />
							{t("form.spatial_footprint.entry_dialog.cancel")}
						</Button>
					</>
				}
			>
				<div className="space-y-4">
					<FieldCard
						caption={t("form.spatial_footprint.entry_dialog.item_type")}
					>
						<div
							role="radiogroup"
							aria-label={t("form.spatial_footprint.entry_dialog.item_type")}
							className="grid grid-cols-1 gap-2 sm:grid-cols-2"
						>
							{itemTypeOptions.map((option) => (
								<label
									key={option.value}
									className="group flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
								>
									{/* Legacy's technique: a transparent native radio laid over the drawn ring. */}
									<span className="relative flex size-6 shrink-0">
										<input
											type="radio"
											name="spatialFootprintEntryItemType"
											className="absolute inset-0 z-10 m-0 cursor-pointer appearance-none opacity-0"
											checked={itemType === option.value}
											onChange={() => {
												setItemType(option.value);
												if (option.value === "map") {
													setStagedDivisionIds([]);
												} else {
													setStagedGeometry(null);
												}
											}}
										/>
										<span
											aria-hidden="true"
											className="flex size-6 items-center justify-center rounded-full border-2 border-gray-300 bg-white group-hover:border-blue-500 group-has-checked:border-blue-500 group-has-checked:bg-blue-500 group-has-focus-visible:ring-4 group-has-focus-visible:ring-blue-200"
										>
											<span className="invisible size-3 rounded-full bg-white group-has-checked:visible" />
										</span>
									</span>
									<span className="text-sm text-slate-700">{option.label}</span>
								</label>
							))}
						</div>
					</FieldCard>

					{itemType === "map" && (
						<FieldCard
							caption={t("form.spatial_footprint.entry_dialog.map_option")}
						>
							<div className="space-y-3">
								<ValueTrigger
									label={t("form.spatial_footprint.entry_dialog.map_option")}
									value={shape?.title ?? ""}
									placeholder={t(
										"form.spatial_footprint.entry_dialog.open_map_action",
									)}
									actionLabel={t(
										"form.spatial_footprint.entry_dialog.open_map_action",
									)}
									onPress={() => setMapDialogOpen(true)}
								/>
								{shape && (
									<div className="m-2 border border-gray-300 p-4 text-base">
										<h4>{shape.title}</h4>
										<ul>
											{shape.lines.map((line, index) => (
												// Corner lines can repeat (a closed line's endpoints).
												<li key={index}>{line}</li>
											))}
										</ul>
									</div>
								)}
							</div>
						</FieldCard>
					)}

					{itemType === "divisions" && (
						<FieldCard
							caption={t("form.spatial_footprint.entry_dialog.division_option")}
						>
							<ValueTrigger
								label={t("form.spatial_footprint.entry_dialog.division_option")}
								value={stagedDivisionText}
								placeholder={t(
									"form.spatial_footprint.entry_dialog.division_placeholder",
								)}
								actionLabel={t(
									"form.spatial_footprint.entry_dialog.select_action",
								)}
								onPress={() => setDivisionsDialogOpen(true)}
							/>
						</FieldCard>
					)}
				</div>
			</Dialog>

			<HazardousEventSpatialFootprintMapDialog
				isOpen={mapDialogOpen}
				initialGeometries={stagedGeometry !== null ? [stagedGeometry] : []}
				previewDivisions={previewDivisions}
				title={t("form.spatial_footprint.map_dialog.title")}
				onSave={(geometries) => {
					setStagedGeometry(geometries[0] ?? null);
					setMapDialogOpen(false);
				}}
				onCancel={() => setMapDialogOpen(false)}
			/>

			<HazardousEventDivisionListDialog
				isOpen={divisionsDialogOpen}
				initialSelectedIds={stagedDivisionIds}
				onApply={(ids) => {
					setStagedDivisionIds(ids);
					setDivisionsDialogOpen(false);
				}}
				onDiscard={() => setDivisionsDialogOpen(false)}
			/>
		</>
	);
}
