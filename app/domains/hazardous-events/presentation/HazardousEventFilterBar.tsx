import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "~/design-system/components/Select";
import { Checkbox } from "~/design-system/components/Checkbox";
import { Combobox } from "~/design-system/components/Combobox";
import { DateRangePicker } from "~/design-system/components/DateRangePicker";
import { Link } from "~/design-system/components/Link";
import type { HazardTaxonomyOptions } from "~/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase";
import {
	DATA_VIEWER_ALLOWED_STATUSES,
	type HazardousEventListFilterInput,
} from "~/domains/hazardous-events/application/use-cases/ListHazardousEvents";
import { HAZARDOUS_EVENT_STATUS_VALUES } from "~/domains/hazardous-events/domain/HazardousEvent";
import { STATUS_VALUES } from "~/domains/validation-workflow/domain/WorkflowInstance";
import { workflowStatusDisplay } from "./workflowStatusDisplay";
import { canAddNewRecord } from "~/frontend/user/roles";

export interface HazardousEventFilterBarProps {
	taxonomyOptions: HazardTaxonomyOptions;
	role: string | null;
	clearFiltersUrl: string;
	currentPageSize: number;
	currentFilters?: HazardousEventListFilterInput;
}

// No shared filter-shell primitive -- composes mg-grid/dts-form directly, HE-owned, same choice
// DisasterRecordsFilter.tsx already made (design.md Decision 11).
export function HazardousEventFilterBar({
	taxonomyOptions,
	role,
	clearFiltersUrl,
	currentPageSize,
	currentFilters,
}: HazardousEventFilterBarProps) {
	const { t } = useTranslation("hazardous-events");

	const [selectedTypeId, setSelectedTypeId] = useState(
		currentFilters?.hazardTypeId,
	);
	const [selectedClusterId, setSelectedClusterId] = useState(
		currentFilters?.hazardClusterId,
	);
	// Each bumped only when that field's value changes from an EXTERNAL driver (another field),
	// forcing a remount so the uncontrolled Select/Combobox picks up the new defaultSelectedKey --
	// never bumped by the field's own onChange, which would needlessly remount (and drop keyboard
	// focus from) a Select the user just operated directly (code-review finding).
	const [typeResetKey, setTypeResetKey] = useState(0);
	const [clusterResetKey, setClusterResetKey] = useState(0);
	const [comboboxResetKey, setComboboxResetKey] = useState(0);

	function handleTypeChange(key: string) {
		setSelectedTypeId(key || undefined);
		setSelectedClusterId(undefined);
		setClusterResetKey((k) => k + 1);
		setComboboxResetKey((k) => k + 1);
	}

	function handleClusterChange(key: string) {
		setSelectedClusterId(key || undefined);
		setComboboxResetKey((k) => k + 1);
	}

	// Fills cluster/type upward (design.md Decision 10) -- an external driver for both Selects.
	function handleHazardSelect(key: string | null) {
		const hazard = taxonomyOptions.specificHazards.find((h) => h.id === key);
		if (!hazard) return;
		const cluster = taxonomyOptions.clusters.find(
			(c) => c.id === hazard.clusterId,
		);
		setSelectedClusterId(cluster?.id);
		setSelectedTypeId(cluster?.typeId);
		setTypeResetKey((k) => k + 1);
		setClusterResetKey((k) => k + 1);
	}

	const filteredClusters = taxonomyOptions.clusters.filter(
		(c) => !selectedTypeId || c.typeId === selectedTypeId,
	);
	// Cluster-only filter, no type check -- legacy's own filteredHazards bug, replicated as-is
	// (design.md Decision 10).
	const filteredHazards = taxonomyOptions.specificHazards.filter(
		(h) => !selectedClusterId || h.clusterId === selectedClusterId,
	);

	const canAddRecords = canAddNewRecord(role);
	const recordStatusValues =
		role === "data-viewer" ? DATA_VIEWER_ALLOWED_STATUSES : STATUS_VALUES;

	return (
		<form className="dts-form" method="get">
			<div className="dts-form__body">
				<div className="mg-grid mg-grid__col-3">
					<div className="dts-form-component">
						<Select
							key={`type-${typeResetKey}`}
							name="hazardTypeId"
							label={t("filters.hazard_type")}
							defaultSelectedKey={selectedTypeId ?? ""}
							onSelectionChange={handleTypeChange}
							options={[
								{ id: "", name: t("filters.all_hazard_types") },
								...taxonomyOptions.types,
							]}
						/>
					</div>
					<div className="dts-form-component">
						<Select
							key={`cluster-${clusterResetKey}`}
							name="hazardClusterId"
							label={t("filters.cluster")}
							defaultSelectedKey={selectedClusterId ?? ""}
							onSelectionChange={handleClusterChange}
							options={[
								{ id: "", name: t("filters.all_clusters") },
								...filteredClusters,
							]}
						/>
					</div>
					<div className="dts-form-component">
						<Combobox
							key={`hazard-${comboboxResetKey}`}
							name="specificHazardId"
							label={t("filters.specific_hazard")}
							placeholder={t("filters.enter_hazard_name_or_hips_id")}
							// Only the initial mount pre-populates from the URL, or a Type/Cluster
							// remount would re-populate the stale id (design.md Decision 10).
							defaultSelectedKey={
								comboboxResetKey === 0
									? currentFilters?.specificHazardId
									: undefined
							}
							options={filteredHazards}
							onSelectionChange={handleHazardSelect}
						/>
					</div>
				</div>

				<div className="mg-grid mg-grid__col-3">
					<DateRangePicker
						fromName="fromDate"
						fromLabel={t("filters.from")}
						fromDefaultValue={currentFilters?.fromDate}
						toName="toDate"
						toLabel={t("filters.to")}
						toDefaultValue={currentFilters?.toDate}
					/>
					<label className="dts-form-component">
						<div className="dts-form-component__label">
							{t("filters.recording_organization")}
						</div>
						<input
							type="text"
							name="recordingOrganization"
							className="dts-text-input"
							defaultValue={currentFilters?.recordingOrganization}
							placeholder={t("filters.search_organization")}
						/>
					</label>
				</div>

				<div className="mg-grid mg-grid__col-2">
					<div className="dts-form-component">
						<Select
							name="hazardousEventStatus"
							label={t("filters.hazardous_event_status")}
							defaultSelectedKey={currentFilters?.hazardousEventStatus ?? ""}
							options={[
								{ id: "", name: t("filters.all_event_statuses") },
								...HAZARDOUS_EVENT_STATUS_VALUES.map((value) => ({
									id: value,
									name: t(`detail.hazardous_event_status_values.${value}`),
								})),
							]}
						/>
					</div>
					<div className="dts-form-component">
						<Select
							name="recordStatus"
							label={t("filters.record_status")}
							defaultSelectedKey={currentFilters?.recordStatus ?? ""}
							options={[
								{ id: "", name: t("filters.all_record_statuses") },
								...recordStatusValues.map((status) => ({
									id: status,
									name: t(`status.${workflowStatusDisplay(status).labelKey}`),
								})),
							]}
						/>
					</div>
				</div>

				<div
					className="dts-form__actions dts-form__actions--standalone"
					style={{ justifyContent: "space-between", alignItems: "center" }}
				>
					{canAddRecords && (
						<div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
							<Checkbox
								name="viewMyRecords"
								label={t("filters.view_my_records")}
								defaultChecked={currentFilters?.viewMyRecords}
							/>
							<Checkbox
								name="pendingMyAction"
								label={t("filters.pending_my_action")}
								defaultChecked={currentFilters?.pendingMyAction}
							/>
						</div>
					)}
					<div style={{ display: "flex", gap: "0.8rem" }}>
						<Link
							href={clearFiltersUrl}
							className="mg-button mg-button-outline mg-button--small"
						>
							{t("filters.clear")}
						</Link>
						<button
							type="submit"
							className="mg-button mg-button--small mg-button-primary"
						>
							{t("filters.apply_filters")}
						</button>
					</div>
				</div>

				<input type="hidden" name="pageSize" value={String(currentPageSize)} />
			</div>
		</form>
	);
}
