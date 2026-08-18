import { DisasterEventRepository } from "~/db/queries/disasterEventRepository";

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

function parseYmd(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	const trimmed = value.trim();
	const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) {
		return null;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);

	if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) {
		return null;
	}

	return { year, month, day };
}

function toUtcDate(parts: { year: number; month: number; day: number }) {
	return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function formatEventDateRange(
	startDate: string | null | undefined,
	endDate: string | null | undefined,
	lang: string,
) {
	const start = parseYmd(startDate);
	const end = parseYmd(endDate);
	const formatter = new Intl.DateTimeFormat(lang || "en", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});

	if (start && end) {
		const startUtc = toUtcDate(start);
		const endUtc = toUtcDate(end);

		if (typeof formatter.formatRange === "function") {
			return formatter.formatRange(startUtc, endUtc);
		}

		return `${formatter.format(startUtc)} - ${formatter.format(endUtc)}`;
	}

	if (start) {
		return formatter.format(toUtcDate(start));
	}

	if (end) {
		return formatter.format(toUtcDate(end));
	}

	return [startDate, endDate]
		.map((value) => value?.trim())
		.filter(Boolean)
		.join(" - ");
}

function localizedHipName(
	name: Record<string, string> | null | undefined,
	lang: string,
) {
	if (!name) {
		return "";
	}

	return String(name[lang] || name.en || Object.values(name)[0] || "").trim();
}

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
	let hipLabel = "";
	if (hazardName) {
		hipLabel = event.hipHazard?.code
			? `H: ${hazardName} (${event.hipHazard.code})`
			: `H: ${hazardName}`;
	} else if (clusterName) {
		hipLabel = `C: ${clusterName}`;
	} else if (typeName) {
		hipLabel = `T: ${typeName}`;
	}

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
