import { HazardousEventRepository } from "~/db/queries/hazardousEventRepository";
import {
	formatEventDateRange,
	localizedHipName,
} from "~/backend.server/services/disaster-event/linkedOptionFormatters";

type HazardousEventRow = {
	id: string;
	description: string | null;
	startDate: string | null;
	endDate: string | null;
	hipHazard: {
		name: Record<string, string> | null;
		code: string | null;
	} | null;
	hipCluster: {
		name: Record<string, string> | null;
	} | null;
	hipType: {
		name: Record<string, string> | null;
	} | null;
};

function formatHazardousEventOption(
	event: HazardousEventRow,
	lang: string,
	divisionNames: string[],
) {
	const hazardName = localizedHipName(event.hipHazard?.name, lang);
	const clusterName = localizedHipName(event.hipCluster?.name, lang);
	const typeName = localizedHipName(event.hipType?.name, lang);
	const displayName = hazardName || clusterName || typeName;

	return {
		id: event.id,
		name: displayName,
		code: event.id,
		dateLabel: formatEventDateRange(event.startDate, event.endDate, lang),
		divisionNamesLabel: divisionNames.join(", "),
	};
}

export async function queryLinkedHazardousEventOptions(
	countryAccountsId: string,
	lang: string,
	blockedHazardousIds: string[],
	keyword?: string,
) {
	const { hazardousEvents, divisionNamesByHazardousEventId } =
		await HazardousEventRepository.getLinkableOptionsData(
			countryAccountsId,
			blockedHazardousIds,
			keyword,
		);

	return hazardousEvents.map((event) =>
		formatHazardousEventOption(
			event,
			lang,
			(divisionNamesByHazardousEventId.get(event.id) || [])
				.map((divisionName) => localizedHipName(divisionName, lang))
				.filter(Boolean),
		),
	);
}
