import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";
import { useViewContext } from "~/frontend/context";
import { roleHasPermission } from "~/frontend/user/roles";

export interface HazardousEventListActionsProps {
	role?: string | null;
}

/** Ports legacy's `DataMainLinks` button (Decision 15) -- route-local, never rendered inside
 * `HazardousEventListPage` itself, so the parent-picker popup (which reuses that component) can't show it. */
export function HazardousEventListActions({
	role,
}: HazardousEventListActionsProps) {
	const ctx = useViewContext();
	const { t } = useTranslation("hazardous-events");

	if (!roleHasPermission(role ?? null, "EditData")) {
		return null;
	}

	return (
		<div className="dts-page-intro">
			<div
				className="dts-additional-actions width-override-data-collection"
				role="navigation"
				aria-label={t("list.resource_actions")}
			>
				<RouterLink
					to={ctx.url("/he-preview/new")}
					className="mg-button mg-button--small mg-button-primary"
				>
					{t("list.add_new_event")}
				</RouterLink>
			</div>
		</div>
	);
}
