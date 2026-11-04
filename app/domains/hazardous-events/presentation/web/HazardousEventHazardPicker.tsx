import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HazardTaxonomyOptions } from "~/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase";
import { HazardousEventFormField } from "./HazardousEventFormField";
import { filterHazardTaxonomy } from "./filterHazardTaxonomy";

export interface HazardousEventHazardPickerProps {
	taxonomyOptions: HazardTaxonomyOptions;
	initialSpecificHazardId: string;
	errors?: readonly string[];
}

/**
 * Ported from legacy's hazardpicker.tsx for exact parity (design.md Decision 9, Gate 9
 * finding) -- NOT a strict type-then-cluster-then-hazard cascade:
 * - The filter box matches hazard names only; surviving clusters/types are derived from the
 *   surviving hazards (`filterHazardTaxonomy`), not matched by their own name.
 * - Neither the cluster nor the hazard select is ever disabled.
 * - Picking a hazard back-fills its cluster and type; picking a cluster back-fills its type.
 * - Changing the filter text clears every selection.
 * - When exactly one TYPE survives, its select renders only that option, no placeholder --
 *   legacy's own quirk (its cluster select has the equivalent behavior hardcoded off,
 *   `false && ...`), replicated exactly rather than "improved."
 *
 * Exported wrapped in `memo` (Decision 20): un-memoized, this re-rendered on every sibling-field
 * keystroke, rebuilding specificHazardId's onChange and corrupting its keyboard/type-ahead state.
 */
function HazardousEventHazardPickerImpl({
	taxonomyOptions,
	initialSpecificHazardId,
	errors,
}: HazardousEventHazardPickerProps) {
	const { t } = useTranslation("hazardous-events");
	const initialHazard = taxonomyOptions.specificHazards.find(
		(h) => h.id === initialSpecificHazardId,
	);
	const initialCluster = initialHazard
		? taxonomyOptions.clusters.find((c) => c.id === initialHazard.clusterId)
		: undefined;

	const [searchTerm, setSearchTerm] = useState("");
	const [typeId, setTypeId] = useState(initialCluster?.typeId ?? "");
	const [clusterId, setClusterId] = useState(initialHazard?.clusterId ?? "");
	const [specificHazardId, setSpecificHazardId] = useState(
		initialSpecificHazardId,
	);

	const filtered = filterHazardTaxonomy(
		taxonomyOptions,
		searchTerm,
		typeId,
		clusterId,
	);

	return (
		<HazardousEventFormField
			label={t("detail.classification.heading")}
			required
			htmlFor="specificHazardId"
			errors={errors}
		>
			<HazardousEventFormField
				label={t("form.fields.filter_by_hazard_name")}
				htmlFor="hazard-filter-input"
			>
				<input
					id="hazard-filter-input"
					type="text"
					value={searchTerm}
					onChange={(e) => {
						setSearchTerm(e.target.value);
						setTypeId("");
						setClusterId("");
						setSpecificHazardId("");
					}}
					placeholder={t("form.fields.filter_by_hazard_name")}
				/>
			</HazardousEventFormField>

			<div className="mg-grid mg-grid__col-3">
				<HazardousEventFormField
					label={t("form.fields.hazard_type")}
					htmlFor="hipTypeId"
				>
					<select
						id="hipTypeId"
						value={typeId}
						onChange={(e) => {
							setTypeId(e.target.value);
							setClusterId("");
							setSpecificHazardId("");
						}}
					>
						{filtered.types.length === 1 ? (
							<option value={filtered.types[0].id}>
								{filtered.types[0].name}
							</option>
						) : (
							<>
								<option value="">{t("form.fields.select_type")}</option>
								{filtered.types.map((type) => (
									<option key={type.id} value={type.id}>
										{type.name}
									</option>
								))}
							</>
						)}
					</select>
				</HazardousEventFormField>
				<HazardousEventFormField
					label={t("form.fields.hazard_cluster")}
					htmlFor="hipClusterId"
				>
					<select
						id="hipClusterId"
						value={clusterId}
						onChange={(e) => {
							const nextClusterId = e.target.value;
							setSpecificHazardId("");
							setClusterId(nextClusterId);
							const matchedCluster = taxonomyOptions.clusters.find(
								(c) => c.id === nextClusterId,
							);
							setTypeId(matchedCluster?.typeId ?? "");
						}}
					>
						<option value="">{t("form.fields.select_cluster")}</option>
						{filtered.clusters.map((cluster) => (
							<option key={cluster.id} value={cluster.id}>
								{cluster.name}
							</option>
						))}
					</select>
				</HazardousEventFormField>
				<HazardousEventFormField
					label={t("form.fields.specific_hazard")}
					required
					htmlFor="specificHazardId"
				>
					<select
						id="specificHazardId"
						name="specificHazardId"
						required
						value={specificHazardId}
						onChange={(e) => {
							const hazardId = e.target.value;
							setSpecificHazardId(hazardId);
							const matchedHazard = taxonomyOptions.specificHazards.find(
								(h) => h.id === hazardId,
							);
							if (matchedHazard) {
								const matchedCluster = taxonomyOptions.clusters.find(
									(c) => c.id === matchedHazard.clusterId,
								);
								setClusterId(matchedCluster?.id ?? "");
								setTypeId(matchedCluster?.typeId ?? "");
							}
						}}
					>
						<option value="">{t("form.fields.select_specific_hazard")}</option>
						{filtered.hazards.map((hazard) => (
							<option key={hazard.id} value={hazard.id}>
								{hazard.name}
							</option>
						))}
					</select>
				</HazardousEventFormField>
			</div>
		</HazardousEventFormField>
	);
}

export const HazardousEventHazardPicker = memo(HazardousEventHazardPickerImpl);
