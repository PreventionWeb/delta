import { DisasterEventRepository } from "~/db/queries/disasterEventRepository";
import {
	buildHipLabel,
	formatEventDateRange,
	localizedHipName,
} from "~/backend.server/services/disaster-event/linkedOptionFormatters";

type DisasterEventRow = {
	id: string;
	nameNational: string | null;
	nameGlobalOrRegional: string | null;
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

function formatDisasterEventOption(
	event: DisasterEventRow,
	lang: string,
	divisionNames: string[],
) {
	const displayName =
		event.nameNational?.trim() ||
		event.nameGlobalOrRegional?.trim() ||
		`DE: ${event.id.slice(0, 8)}`;
	const hazardName = localizedHipName(event.hipHazard?.name, lang);
	const clusterName = localizedHipName(event.hipCluster?.name, lang);
	const typeName = localizedHipName(event.hipType?.name, lang);
	const hipLabel = buildHipLabel({
		hazardName,
		clusterName,
		typeName,
		hazardCode: event.hipHazard?.code,
	});

	return {
		id: event.id,
		name: displayName,
		code: event.id,
		hip: hipLabel,
		dateLabel: formatEventDateRange(event.startDate, event.endDate, lang),
		divisionNamesLabel: divisionNames.join(", "),
	};
}

export async function queryLinkedDisasterEventOptions(
	countryAccountsId: string,
	currentItemId: string | undefined,
	lang: string,
	keyword?: string,
) {
	const { disasterEvents, divisionNamesByDisasterEventId } =
		await DisasterEventRepository.getLinkableOptionsData(
			countryAccountsId,
			currentItemId,
			keyword,
		);

	return disasterEvents.map((event) =>
		formatDisasterEventOption(
			event,
			lang,
			(divisionNamesByDisasterEventId.get(event.id) || [])
				.map((divisionName) => localizedHipName(divisionName, lang))
				.filter(Boolean),
		),
	);
}
