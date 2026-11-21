import { useTranslation } from "react-i18next";
import { useDivisionTree, divisionLabel } from "./useDivisionTree";

export interface HazardousEventDivisionNamesProps {
	divisionIds: readonly string[];
}

/** Detail page's division list by breadcrumb path (same labels as the form's rows), resolved
 * from the cached division-tree fetch -- never the raw ids. */
export function HazardousEventDivisionNames({
	divisionIds,
}: HazardousEventDivisionNamesProps) {
	const { t } = useTranslation("hazardous-events");
	// A failed fetch still lists every entry, by the unknown-division label.
	const { status, tree } = useDivisionTree();

	const label = t("detail.spatial_observation.division_ids");

	return (
		<div>
			<strong>{`${label}:`}</strong>
			{status === "loading" ? (
				<p role="status">
					{t("form.spatial_footprint.division_dialog.loading")}
				</p>
			) : (
				<ul aria-label={label} className="list-disc ps-6">
					{divisionIds.map((id) => (
						<li key={id}>{divisionLabel(tree, id, t)}</li>
					))}
				</ul>
			)}
		</div>
	);
}
