import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HazardousEventSpatialFootprintMap } from "./HazardousEventSpatialFootprintMap";
import { Dialog } from "~/design-system/components/Dialog";
import type { DivisionPreviewEntry } from "./useDivisionBoundaryPreviews";

export interface HazardousEventSpatialFootprintMapDialogProps {
	isOpen: boolean;
	initialGeometries: readonly unknown[];
	previewDivisions: readonly DivisionPreviewEntry[];
	title: string;
	/** Fires only on Save Coordinates. Escape/close-icon discard the session. */
	onSave: (geometries: readonly unknown[]) => void;
	onCancel: () => void;
}

/** Legacy's full-screen "Mapper", shared by Add's Open map and a geometry row's Edit. × discards, as legacy. */
export function HazardousEventSpatialFootprintMapDialog({
	isOpen,
	initialGeometries,
	previewDivisions,
	title,
	onSave,
	onCancel,
}: HazardousEventSpatialFootprintMapDialogProps) {
	const { t } = useTranslation("hazardous-events");
	// Snapshot at open: the map reads it once on mount, so a later prop change mustn't leak in.
	const [openedWith, setOpenedWith] =
		useState<readonly unknown[]>(initialGeometries);
	const [drawActive, setDrawActive] = useState(false);
	const [wasOpen, setWasOpen] = useState(isOpen);

	// Reset during render, not an effect -- the map mounts this pass and would prefill stale shapes.
	// State, not a ref: StrictMode-safe.
	if (isOpen !== wasOpen) {
		setWasOpen(isOpen);
		if (isOpen) {
			setOpenedWith(initialGeometries);
			setDrawActive(false);
		}
	}

	return (
		<Dialog
			variant="fullscreen"
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
			title={title}
			closeLabel={t("form.close")}
			dismissDisabled={drawActive}
		>
			<HazardousEventSpatialFootprintMap
				geometries={openedWith}
				onSave={onSave}
				previewDivisions={previewDivisions}
				onDrawActiveChange={setDrawActive}
				aria-label={t("detail.spatial_observation.map_label")}
			/>
		</Dialog>
	);
}
