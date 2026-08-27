import { DisasterRecordsRepository } from "~/db/queries/disasterRecordsRepository";
import {
	buildHipLabel,
	formatEventDateRange,
	localizedHipName,
} from "~/backend.server/services/disaster-event/linkedOptionFormatters";

type DisasterRecordRow = {
	id: string;
	disasterEventId: string | null;
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

function formatDisasterRecordOption(
	record: DisasterRecordRow,
	lang: string,
	divisionNames: string[],
) {
	const hazardName = localizedHipName(record.hipHazard?.name, lang);
	const clusterName = localizedHipName(record.hipCluster?.name, lang);
	const typeName = localizedHipName(record.hipType?.name, lang);
	const hipLabel = buildHipLabel({
		hazardName,
		clusterName,
		typeName,
		hazardCode: record.hipHazard?.code,
	});

	return {
		id: record.id,
		name: `UUID: ${record.id.slice(0, 8)}`,
		code: record.id,
		hip: hipLabel,
		dateLabel: formatEventDateRange(
			record.startDate,
			record.endDate,
			lang,
		),
		divisionNamesLabel: divisionNames.join(", "),
	};
}

export async function queryLinkedDisasterRecordOptions(
	countryAccountsId: string,
	lang: string,
	keyword?: string,
) {
	const { disasterRecords, divisionNamesByDisasterRecordId } =
		await DisasterRecordsRepository.getLinkableOptionsData(
			countryAccountsId,
			keyword,
		);

	return disasterRecords.map((record) => {
		const divisionNames = record.id
			? (divisionNamesByDisasterRecordId.get(record.id) || [])
				.map((divisionName) => localizedHipName(divisionName, lang))
				.filter(Boolean)
			: [];

		return formatDisasterRecordOption(record, lang, divisionNames);
	});
}
