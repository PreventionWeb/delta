export function localizedHipName(
	name: Record<string, string> | null | undefined,
	lang: string,
) {
	if (!name) {
		return "";
	}

	return String(name[lang] || name.en || Object.values(name)[0] || "").trim();
}

export function formatEventDateRange(
	startDate: string | null | undefined,
	endDate: string | null | undefined,
	lang: string,
) {
	const parseYmd = (value: string | null | undefined) => {
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

		if (
			!Number.isInteger(year) ||
			month < 1 ||
			month > 12 ||
			day < 1 ||
			day > 31
		) {
			return null;
		}

		return { year, month, day };
	};

	const toUtcDate = (parts: { year: number; month: number; day: number }) =>
		new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

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

export function buildHipLabel({
	hazardName,
	clusterName,
	typeName,
	hazardCode,
}: {
	hazardName: string;
	clusterName: string;
	typeName: string;
	hazardCode?: string | null;
}) {
	if (hazardName) {
		return hazardCode ? `H: ${hazardName} (${hazardCode})` : `H: ${hazardName}`;
	}

	if (clusterName) {
		return `C: ${clusterName}`;
	}

	if (typeName) {
		return `T: ${typeName}`;
	}

	return "";
}
