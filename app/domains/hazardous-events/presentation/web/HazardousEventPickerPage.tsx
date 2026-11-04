import { useTranslation } from "react-i18next";
import type { HazardousEventListItemDto } from "~/domains/hazardous-events/application/dto/HazardousEventListItemDto";
import type { PageProps } from "~/frontend/page-props";
import {
	HazardousEventListPage,
	type HazardousEventListPageData,
} from "./HazardousEventListPage";

/** Posts the selected event back to the opener, then closes the window (Decision 13) --
 * same `{ selected }` shape as legacy's hazardeventform.tsx:422-432. Exported for the presentation test. */
export function selectParentEvent(item: HazardousEventListItemDto): void {
	window.opener?.postMessage(
		{ selected: { id: item.id, specificHazardName: item.specificHazardName } },
		window.location.origin,
	);
	// A deferred close (not immediate) -- closing synchronously right after postMessage risks the
	// message event never reaching the opener before the window is gone (found via E2E testing).
	setTimeout(() => window.close(), 50);
}

export function HazardousEventPickerPage({
	data,
}: PageProps<HazardousEventListPageData>) {
	const { t } = useTranslation("hazardous-events");

	return (
		<HazardousEventListPage
			data={data}
			basePath="/he-preview/picker"
			renderActionsCell={(item) => (
				<button
					type="button"
					className="mg-button mg-button-table"
					onClick={() => selectParentEvent(item)}
				>
					{t("picker.select")}
				</button>
			)}
		/>
	);
}
