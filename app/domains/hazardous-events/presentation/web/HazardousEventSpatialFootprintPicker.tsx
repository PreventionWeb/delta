import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	HazardousEventSpatialFootprintEntryDialog,
	type SpatialFootprintAddResult,
} from "./HazardousEventSpatialFootprintEntryDialog";
import { HazardousEventSpatialFootprintMapDialog } from "./HazardousEventSpatialFootprintMapDialog";
import { HazardousEventLocationMap } from "./HazardousEventLocationMap";
import { HazardousEventFormFieldErrors } from "./HazardousEventFormFieldErrors";
import { useDivisionBoundaryPreviews } from "./useDivisionBoundaryPreviews";
import { serializeSpatialObservation } from "./serializeSpatialObservation";
import { describeGeometry } from "./describeGeometry";
import type { BareGeometry } from "./spatialFootprintGeometry";
import { useDivisionTree, divisionLabel } from "./useDivisionTree";
import { Section } from "~/design-system/components/Section";
import { LegacyButton as Button } from "~/design-system/components/LegacyButton";
import { Dialog } from "~/design-system/components/Dialog";
import { Table } from "~/design-system/components/Table";
import { TableColumn } from "~/design-system/components/TableColumn";
import { TableRow } from "~/design-system/components/TableRow";
import { TableCell } from "~/design-system/components/TableCell";
import { useViewContext } from "~/frontend/context";

export interface HazardousEventSpatialFootprintPickerProps {
	currentSpatialObservation?: {
		geometries: readonly unknown[];
		divisionIds: readonly string[];
	} | null;
	errors?: readonly string[];
}

type Row =
	| { kind: "geometry"; index: number; geometry: unknown; label: string }
	| { kind: "division"; index: number; id: string; label: string };

/** Row table plus its dialogs; owns `{geometries, divisionIds}` and the hidden fields the create/edit actions read. */
export function HazardousEventSpatialFootprintPicker({
	currentSpatialObservation = null,
	errors,
}: HazardousEventSpatialFootprintPickerProps) {
	const { t } = useTranslation("hazardous-events");
	const ctx = useViewContext();
	const [geometries, setGeometries] = useState<readonly unknown[]>(
		currentSpatialObservation?.geometries ?? [],
	);
	const [divisionIds, setDivisionIds] = useState<readonly string[]>(
		currentSpatialObservation?.divisionIds ?? [],
	);
	const [addDialogOpen, setAddDialogOpen] = useState(false);
	const [editingGeometryIndex, setEditingGeometryIndex] = useState<
		number | null
	>(null);
	const [previewMapOpen, setPreviewMapOpen] = useState(false);
	// A division row's Edit reuses the Add dialog as legacy's "Edit item", pre-filled.
	const [editingDivisionIndex, setEditingDivisionIndex] = useState<
		number | null
	>(null);

	const previewDivisions = useDivisionBoundaryPreviews(divisionIds, (id) =>
		ctx.url(`/api/geojson/${id}`),
	);

	// Only a real draw/selection change flips the hidden spatialObservationChanged field -- an
	// edit-mode prefill with real data must NOT read as "touched".
	const interactedRef = useRef(false);

	function handleGeometriesChange(next: readonly unknown[]) {
		interactedRef.current = true;
		setGeometries(next);
	}

	function handleDivisionIdsChange(next: readonly string[]) {
		interactedRef.current = true;
		setDivisionIds([...new Set(next)]);
	}

	const divisionTree = useDivisionTree(divisionIds.length > 0).tree;

	const rows: readonly Row[] = useMemo(
		() => [
			...geometries.map((geometry, index) => ({
				kind: "geometry" as const,
				index,
				geometry,
				label: describeGeometry(geometry as BareGeometry),
			})),
			...divisionIds.map((id, index) => ({
				kind: "division" as const,
				index,
				id,
				label: divisionLabel(divisionTree, id, t),
			})),
		],
		[geometries, divisionIds, divisionTree, t],
	);

	function handleAddApply(result: SpatialFootprintAddResult) {
		if (result.kind === "map") {
			handleGeometriesChange([...geometries, result.geometry]);
			setAddDialogOpen(false);
			return;
		}
		// Defends against the tree offering a division already committed from a prior session.
		const newIds = result.divisionIds.filter((id) => !divisionIds.includes(id));
		if (newIds.length === 0) {
			// Nothing new to commit -- stay open rather than closing as if it had worked.
			return;
		}
		handleDivisionIdsChange([...divisionIds, ...newIds]);
		setAddDialogOpen(false);
	}

	function handleDeleteRow(row: Row) {
		if (row.kind === "geometry") {
			handleGeometriesChange(
				geometries.filter((_, index) => index !== row.index),
			);
		} else {
			handleDivisionIdsChange(
				divisionIds.filter((_, index) => index !== row.index),
			);
		}
	}

	function handleEditSave(saved: readonly unknown[]) {
		if (editingGeometryIndex === null) {
			return;
		}
		const next = [...geometries];
		if (saved.length === 0) {
			// Delete-then-save in the direct-Edit session removes the row, same as the row's own
			// Delete action would.
			next.splice(editingGeometryIndex, 1);
		} else {
			next[editingGeometryIndex] = saved[0];
		}
		handleGeometriesChange(next);
		setEditingGeometryIndex(null);
	}

	// Apply replaces the row in place (extra picks right after it, ones in other rows dropped);
	// switching to Map coordinates turns it into a geometry row. Cancel never reaches here.
	function handleDivisionEditApply(result: SpatialFootprintAddResult) {
		if (editingDivisionIndex === null) {
			return;
		}
		const original = divisionIds[editingDivisionIndex];
		const others = divisionIds.filter(
			(_, index) => index !== editingDivisionIndex,
		);
		if (result.kind === "map") {
			handleDivisionIdsChange(others);
			handleGeometriesChange([...geometries, result.geometry]);
			setEditingDivisionIndex(null);
			return;
		}
		const replacements = result.divisionIds.filter(
			(id) => !others.includes(id),
		);
		if (replacements.length === 0) {
			// Every pick is already another row -- stay open, as Add does.
			return;
		}
		const unchanged = replacements.length === 1 && replacements[0] === original;
		if (!unchanged) {
			const next = [...divisionIds];
			next.splice(editingDivisionIndex, 1, ...replacements);
			handleDivisionIdsChange(next);
		}
		setEditingDivisionIndex(null);
	}

	// A division-only row has nothing HazardousEventLocationMap can render from geometries alone
	// -- combining in its boundary keeps Preview map non-empty for that case too.
	const previewGeometries = useMemo(
		() => [
			...geometries,
			...previewDivisions.map((division) => division.geojson),
		],
		[geometries, previewDivisions],
	);

	const { spatialObservation, spatialObservationChanged } =
		serializeSpatialObservation(geometries, divisionIds, interactedRef.current);

	return (
		<div>
			<Section
				title={t("detail.fields.spatial_footprint")}
				actions={
					<>
						<Button variant="system" onPress={() => setAddDialogOpen(true)}>
							{t("form.spatial_footprint.add_action")}
						</Button>
						<Button
							variant="system"
							disabled={rows.length === 0}
							onPress={() => setPreviewMapOpen(true)}
						>
							{t("form.spatial_footprint.preview_action")}
						</Button>
					</>
				}
			>
				<Table
					aria-label={t("detail.fields.spatial_footprint")}
					header={
						<>
							{/* Option fits its longest label even when empty; Action shrinks to content; Value takes the rest.
							 * `!` beats legacy's unlayered th text-align. */}
							<TableColumn id="option" className="w-40 whitespace-nowrap">
								{t("form.spatial_footprint.table.columns.option")}
							</TableColumn>
							<TableColumn id="value" isRowHeader>
								{t("form.spatial_footprint.table.columns.value")}
							</TableColumn>
							<TableColumn
								id="actions"
								className="w-px whitespace-nowrap !text-right"
							>
								{t("form.spatial_footprint.table.columns.actions")}
							</TableColumn>
						</>
					}
				>
					{rows.map((row) => (
						<TableRow
							id={`${row.kind}-${row.index}`}
							key={`${row.kind}-${row.index}`}
						>
							<TableCell className="whitespace-nowrap">
								{row.kind === "geometry"
									? t("form.spatial_footprint.entry_dialog.map_option")
									: t("form.spatial_footprint.entry_dialog.division_option")}
							</TableCell>
							<TableCell>{row.label}</TableCell>
							<TableCell className="whitespace-nowrap text-right" focusChild>
								{/* Legacy order: delete, then edit. */}
								<span className="inline-flex items-center gap-2.5">
									<Button
										variant="icon"
										aria-label={t("form.spatial_footprint.row_delete", {
											label: row.label,
											// React escapes already; i18next would turn "/" into &#x2F;.
											interpolation: { escapeValue: false },
										})}
										onPress={() => handleDeleteRow(row)}
									>
										<i
											className="pi pi-trash"
											aria-hidden="true"
											title={t("form.spatial_footprint.row_delete_action")}
										/>
									</Button>
									<Button
										variant="icon"
										aria-label={t("form.spatial_footprint.row_edit", {
											label: row.label,
											interpolation: { escapeValue: false },
										})}
										onPress={() =>
											row.kind === "geometry"
												? setEditingGeometryIndex(row.index)
												: setEditingDivisionIndex(row.index)
										}
									>
										<i
											className="pi pi-pencil"
											aria-hidden="true"
											title={t("form.spatial_footprint.row_edit_action")}
										/>
									</Button>
								</span>
							</TableCell>
						</TableRow>
					))}
				</Table>
			</Section>

			<HazardousEventSpatialFootprintEntryDialog
				isOpen={addDialogOpen}
				previewDivisions={previewDivisions}
				onApply={handleAddApply}
				onDismiss={() => setAddDialogOpen(false)}
			/>

			<HazardousEventSpatialFootprintMapDialog
				isOpen={editingGeometryIndex !== null}
				initialGeometries={
					editingGeometryIndex !== null
						? [geometries[editingGeometryIndex]]
						: []
				}
				previewDivisions={previewDivisions}
				title={t("form.spatial_footprint.map_dialog.title")}
				onSave={handleEditSave}
				onCancel={() => setEditingGeometryIndex(null)}
			/>

			<HazardousEventSpatialFootprintEntryDialog
				isOpen={editingDivisionIndex !== null}
				initial={
					editingDivisionIndex !== null
						? {
								kind: "divisions",
								divisionIds: [divisionIds[editingDivisionIndex]],
							}
						: null
				}
				previewDivisions={previewDivisions}
				onApply={handleDivisionEditApply}
				onDismiss={() => setEditingDivisionIndex(null)}
			/>

			{/* Legacy opens a full-page "Map preview" tab; same full-screen look as the Mapper, without leaving the form. */}
			<Dialog
				variant="fullscreen"
				isOpen={previewMapOpen}
				onOpenChange={setPreviewMapOpen}
				title={t("form.spatial_footprint.preview_dialog_title")}
				closeLabel={t("form.close")}
			>
				<HazardousEventLocationMap
					fill
					geometries={previewGeometries}
					aria-label={t("detail.spatial_observation.map_label")}
				/>
			</Dialog>

			<input
				type="hidden"
				name="spatialObservation"
				value={spatialObservation}
			/>
			<input
				type="hidden"
				name="spatialObservationChanged"
				value={spatialObservationChanged}
			/>
			<HazardousEventFormFieldErrors errors={errors} />
		</div>
	);
}
