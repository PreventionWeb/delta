import { useTranslation } from "react-i18next";

export interface HazardousEventListHeaderProps {
	totalCount: number;
	instanceName: string;
}

/** Ports legacy's `HazardEventHeader` (Decision 15) -- an always-unfiltered total, distinct from
 * `HazardousEventListPage`'s own filtered `list.showing_of_total` line. No role gate (legacy renders unconditionally). */
export function HazardousEventListHeader({
	totalCount,
	instanceName,
}: HazardousEventListHeaderProps) {
	const { t } = useTranslation("hazardous-events");

	return (
		<div className="dts-page-intro">
			<h2 className="mg-u-margin-bottom--sm">
				{t("list.count_in_instance", {
					count: totalCount,
					instance: instanceName,
				})}
			</h2>
		</div>
	);
}
