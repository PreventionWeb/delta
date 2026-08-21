import { DisasterRecordsRepository } from "~/db/queries/disasterRecordsRepository";
import { EventCausalityRepository } from "~/db/queries/eventCausalityRepository";
import { queryLinkedDisasterEventOptions } from "~/backend.server/services/disaster-event/linkedDisasterEventOptions";
import { queryLinkedDisasterRecordOptions } from "~/backend.server/services/disaster-event/linkedDisasterRecordOptions";
import { queryLinkedHazardousEventOptions } from "~/backend.server/services/disaster-event/linkedHazardousEventOptions";

export async function getLinkedHazardousData(
	countryAccountsId: string,
	lang: string,
	itemId: string,
	selectedHazardousEventId?: string | null,
) {
	const [hazardousEventOptions, linkedHazardousIds] = await Promise.all([
		queryLinkedHazardousEventOptions(countryAccountsId, lang, []),
		EventCausalityRepository.getLinkedHazardousEventIds(itemId),
	]);

	const hazardousEventOptionsById = new Map(
		hazardousEventOptions.map((event) => [event.id, event]),
	);

	const linkedTriggeringHazardousEvents = linkedHazardousIds.linkedTriggeringHazardousEventIds
		.map((id) => hazardousEventOptionsById.get(id) || null)
		.filter((event): event is NonNullable<typeof event> => Boolean(event));

	const linkedTriggeredHazardousEvents = linkedHazardousIds.linkedTriggeredHazardousEventIds
		.map((id) => hazardousEventOptionsById.get(id) || null)
		.filter((event): event is NonNullable<typeof event> => Boolean(event));

	if (selectedHazardousEventId) {
		const legacyLinked = hazardousEventOptionsById.get(selectedHazardousEventId);
		if (
			legacyLinked &&
			!linkedTriggeredHazardousEvents.some(
				(event) => event.id === legacyLinked.id,
			)
		) {
			linkedTriggeredHazardousEvents.unshift(legacyLinked);
		}
	}

	return {
		hazardousEventOptions,
		linkedTriggeringHazardousEvents,
		linkedTriggeredHazardousEvents,
	};
}

export async function getLinkedDisasterData(
	countryAccountsId: string,
	itemId: string,
	lang: string,
) {
	const [
		disasterEventOptions,
		linkedDisasterEventIds,
		disasterRecordOptions,
		linkedDisasterRecordIds,
	] = await Promise.all([
		queryLinkedDisasterEventOptions(countryAccountsId, itemId, lang),
		EventCausalityRepository.getLinkedDisasterEventIds(itemId),
		queryLinkedDisasterRecordOptions(countryAccountsId, lang),
		DisasterRecordsRepository.getIdsByDisasterEventIdAndCountryAccountsId(
			itemId,
			countryAccountsId,
		),
	]);

	const disasterEventOptionsById = new Map(
		disasterEventOptions.map((event) => [event.id, event]),
	);

	const linkedTriggeringDisasterEvents = linkedDisasterEventIds.linkedTriggeringDisasterEventIds
		.map((id) => disasterEventOptionsById.get(id) || null)
		.filter((event): event is NonNullable<typeof event> => Boolean(event));

	const linkedTriggeredDisasterEvents = linkedDisasterEventIds.linkedTriggeredDisasterEventIds
		.map((id) => disasterEventOptionsById.get(id) || null)
		.filter((event): event is NonNullable<typeof event> => Boolean(event));

	const disasterRecordOptionsById = new Map(
		disasterRecordOptions.map((event) => [event.id, event]),
	);

	const linkedDisasterRecords = linkedDisasterRecordIds
		.map((id) => disasterRecordOptionsById.get(id) || null)
		.filter((event): event is NonNullable<typeof event> => Boolean(event));

	return {
		disasterEventOptions,
		linkedTriggeringDisasterEvents,
		linkedTriggeredDisasterEvents,
		disasterRecordOptions,
		linkedDisasterRecords,
	};
}
