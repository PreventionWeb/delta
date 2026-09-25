import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { dr } from "~/db.server";
import { countriesTable } from "~/drizzle/schema/countriesTable";
import { countryAccountsTable } from "~/drizzle/schema/countryAccountsTable";
import { deathsTable } from "~/drizzle/schema/deathsTable";
import { damagesTable } from "~/drizzle/schema/damagesTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { disasterRecordsDivisionTable } from "~/drizzle/schema/disasterRecordsDivisionTable";
import { disasterRecordsTable } from "~/drizzle/schema/disasterRecordsTable";
import { disruptionTable } from "~/drizzle/schema/disruptionTable";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { hipHazardTable } from "~/drizzle/schema/hipHazardTable";
import { humanCategoryPresenceTable } from "~/drizzle/schema/humanCategoryPresenceTable";
import { humanDsgTable } from "~/drizzle/schema/humanDsgTable";
import { injuredTable } from "~/drizzle/schema/injuredTable";
import { lossesTable } from "~/drizzle/schema/lossesTable";
import { missingTable } from "~/drizzle/schema/missingTable";
import { sectorTable } from "~/drizzle/schema/sectorTable";

type CountMetric = { total: number | null };
type LossMetric = {
	total: number | null;
	destroyed: number | null;
	damaged: number | null;
	economic: number | null;
};
type Metric = CountMetric | LossMetric;

export interface ConsolidatedResponse {
	ctycode: string;
	year: string;
	indicator: string;
	value: Metric;
	source: "DesInventar Official database";
	hazards: Record<string, Metric>;
	subdivision1: Record<string, Metric>;
	otherdisaggregation: Record<string, Record<string, Metric>>;
}

// const APPROVAL_STATUSES = ["published", "validated"] as const;
const APPROVAL_STATUSES = ["published"] as const;

const COUNT_INDICATOR_CONFIG = {
	a2a: {
		presenceCol: humanCategoryPresenceTable.deaths,
		presenceTotalCol: humanCategoryPresenceTable.deathsTotal,
		metricTable: deathsTable,
		metricCol: deathsTable.deaths,
	},
	a3a: {
		presenceCol: humanCategoryPresenceTable.missing,
		presenceTotalCol: humanCategoryPresenceTable.missingTotal,
		metricTable: missingTable,
		metricCol: missingTable.missing,
	},
	b2: {
		presenceCol: humanCategoryPresenceTable.injured,
		presenceTotalCol: humanCategoryPresenceTable.injuredTotal,
		metricTable: injuredTable,
		metricCol: injuredTable.injured,
	},
} as const;

export type SupportedCountIndicator = keyof typeof COUNT_INDICATOR_CONFIG;
export type SupportedIndicator =
	| SupportedCountIndicator
	| "b3"
	| "b3a"
	| "b4"
	| "b4a"
	| "b5"
	| "c4"
	| "c5a"
	| "c5b"
	| "c5c"
	| "d6"
	| "d7"
	| "d8";

function jsonMapToLabel(value: unknown): string {
	if (!value) return "";
	if (typeof value === "string") return value;
	if (typeof value !== "object") return "";
	const map = value as Record<string, string>;
	for (const lang of ["en", "es", "fr", "ar"]) {
		const v = map[lang];
		if (typeof v === "string" && v.trim().length > 0) return v;
	}
	for (const v of Object.values(map)) {
		if (typeof v === "string" && v.trim().length > 0) return v;
	}
	return "";
}

async function countryMatchesTenant(
	countryAccountsId: string,
	countryCodeLower: string,
): Promise<boolean> {
	const row = await dr
		.select({ iso3: countriesTable.iso3 })
		.from(countryAccountsTable)
		.innerJoin(countriesTable, eq(countryAccountsTable.countryId, countriesTable.id))
		.where(eq(countryAccountsTable.id, countryAccountsId))
		.limit(1);

	if (!row.length || !row[0].iso3) return false;
	return row[0].iso3.toLowerCase() === countryCodeLower;
}

async function totalByIndicator(
	countryAccountsId: string,
	year: string,
	indicator: SupportedCountIndicator,
): Promise<number | null> {
	const cfg = COUNT_INDICATOR_CONFIG[indicator];
	const rows = await dr
		.select({ sum: sql<number | null>`sum(${cfg.presenceTotalCol})` })
		.from(disasterRecordsTable)
		.innerJoin(
			humanCategoryPresenceTable,
			eq(humanCategoryPresenceTable.recordId, disasterRecordsTable.id),
		)
		.where(
			and(
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				eq(cfg.presenceCol, true),
				inArray(disasterRecordsTable.approvalStatus, APPROVAL_STATUSES as any),
				sql`substring(${disasterRecordsTable.startDate}, 1, 4) = ${year}`,
			),
		);

	return rows[0]?.sum ?? null;
}

async function totalsByHazard(
	countryAccountsId: string,
	year: string,
	indicator: SupportedCountIndicator,
): Promise<Record<string, CountMetric>> {
	const cfg = COUNT_INDICATOR_CONFIG[indicator];
	const rows = await dr
		.select({
			hazardName: hipHazardTable.name,
			sum: sql<number | null>`sum(${cfg.presenceTotalCol})`,
		})
		.from(disasterRecordsTable)
		.innerJoin(
			humanCategoryPresenceTable,
			eq(humanCategoryPresenceTable.recordId, disasterRecordsTable.id),
		)
		.leftJoin(
			disasterEventTable,
			eq(disasterEventTable.id, disasterRecordsTable.disasterEventId),
		)
		.leftJoin(
			hipHazardTable,
			sql`${hipHazardTable.id} = coalesce(${disasterRecordsTable.hipHazardId}, ${disasterEventTable.hipHazardId})`,
		)
		.where(
			and(
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				eq(cfg.presenceCol, true),
				inArray(disasterRecordsTable.approvalStatus, APPROVAL_STATUSES as any),
				sql`substring(${disasterRecordsTable.startDate}, 1, 4) = ${year}`,
				isNotNull(hipHazardTable.id),
			),
		)
		.groupBy(hipHazardTable.name);

	const hazards: Record<string, CountMetric> = {};
	for (const row of rows) {
		const label = jsonMapToLabel(row.hazardName);
		if (!label) continue;
		hazards[label] = { total: row.sum ?? null };
	}
	return hazards;
}

async function totalsBySubdivisionLevel1(
	countryAccountsId: string,
	year: string,
	indicator: SupportedCountIndicator,
): Promise<Record<string, CountMetric>> {
	const cfg = COUNT_INDICATOR_CONFIG[indicator];
	const rows = await dr
		.select({
			divisionName: divisionTable.name,
			sum: sql<number | null>`sum(${cfg.presenceTotalCol})`,
		})
		.from(disasterRecordsTable)
		.innerJoin(
			humanCategoryPresenceTable,
			eq(humanCategoryPresenceTable.recordId, disasterRecordsTable.id),
		)
		.innerJoin(
			disasterRecordsDivisionTable,
			eq(disasterRecordsDivisionTable.disasterRecordId, disasterRecordsTable.id),
		)
		.innerJoin(
			divisionTable,
			eq(divisionTable.id, disasterRecordsDivisionTable.divisionId),
		)
		.where(
			and(
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				eq(cfg.presenceCol, true),
				inArray(disasterRecordsTable.approvalStatus, APPROVAL_STATUSES as any),
				sql`substring(${disasterRecordsTable.startDate}, 1, 4) = ${year}`,
				eq(divisionTable.level, 1),
			),
		)
		.groupBy(divisionTable.name);

	const subdivisions: Record<string, CountMetric> = {};
	for (const row of rows) {
		const label = jsonMapToLabel(row.divisionName);
		if (!label) continue;
		subdivisions[label] = { total: row.sum ?? null };
	}
	return subdivisions;
}

async function disaggregationSumByColumn(
	countryAccountsId: string,
	year: string,
	indicator: SupportedCountIndicator,
	groupCol:
		| typeof humanDsgTable.sex
		| typeof humanDsgTable.age
		| typeof humanDsgTable.disability
		| typeof humanDsgTable.nationalPovertyLine,
): Promise<Map<string, number | null>> {
	const cfg = COUNT_INDICATOR_CONFIG[indicator];
	const rows = await dr
		.select({
			key: groupCol,
			sum: sql<number | null>`sum(${cfg.metricCol})`,
		})
		.from(disasterRecordsTable)
		.innerJoin(
			humanCategoryPresenceTable,
			eq(humanCategoryPresenceTable.recordId, disasterRecordsTable.id),
		)
		.innerJoin(humanDsgTable, eq(humanDsgTable.recordId, disasterRecordsTable.id))
		.innerJoin(cfg.metricTable, eq(cfg.metricTable.dsgId, humanDsgTable.id))
		.where(
			and(
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				eq(cfg.presenceCol, true),
				inArray(disasterRecordsTable.approvalStatus, APPROVAL_STATUSES as any),
				sql`substring(${disasterRecordsTable.startDate}, 1, 4) = ${year}`,
				isNotNull(groupCol),
				groupCol === humanDsgTable.sex
					? isNull(humanDsgTable.age)
					: undefined,
				groupCol === humanDsgTable.sex
					? isNull(humanDsgTable.disability)
					: undefined,
				groupCol === humanDsgTable.sex
					? isNull(humanDsgTable.globalPovertyLine)
					: undefined,
				groupCol === humanDsgTable.sex
					? isNull(humanDsgTable.nationalPovertyLine)
					: undefined,
				groupCol === humanDsgTable.age ? isNull(humanDsgTable.sex) : undefined,
				groupCol === humanDsgTable.age
					? isNull(humanDsgTable.disability)
					: undefined,
				groupCol === humanDsgTable.age
					? isNull(humanDsgTable.globalPovertyLine)
					: undefined,
				groupCol === humanDsgTable.age
					? isNull(humanDsgTable.nationalPovertyLine)
					: undefined,
				groupCol === humanDsgTable.disability
					? isNull(humanDsgTable.sex)
					: undefined,
				groupCol === humanDsgTable.disability
					? isNull(humanDsgTable.age)
					: undefined,
				groupCol === humanDsgTable.disability
					? isNull(humanDsgTable.globalPovertyLine)
					: undefined,
				groupCol === humanDsgTable.disability
					? isNull(humanDsgTable.nationalPovertyLine)
					: undefined,
				groupCol === humanDsgTable.nationalPovertyLine
					? isNull(humanDsgTable.sex)
					: undefined,
				groupCol === humanDsgTable.nationalPovertyLine
					? isNull(humanDsgTable.age)
					: undefined,
				groupCol === humanDsgTable.nationalPovertyLine
					? isNull(humanDsgTable.disability)
					: undefined,
				groupCol === humanDsgTable.nationalPovertyLine
					? isNull(humanDsgTable.globalPovertyLine)
					: undefined,
				sql`(
					${humanDsgTable.custom} IS NULL
					OR ${humanDsgTable.custom} = '{}'::jsonb
					OR (
						SELECT COUNT(*)
						FROM jsonb_each(${humanDsgTable.custom})
						WHERE jsonb_typeof(value) != 'null'
					) = 0
				)`,
			),
		)
		.groupBy(groupCol);

	const map = new Map<string, number | null>();
	for (const row of rows) {
		if (!row.key) continue;
		map.set(row.key, row.sum ?? null);
	}
	return map;
}

async function otherDisaggregations(
	countryAccountsId: string,
	year: string,
	indicator: SupportedCountIndicator,
): Promise<Record<string, Record<string, CountMetric>>> {
	const [sex, age, disability, income] = await Promise.all([
		disaggregationSumByColumn(
			countryAccountsId,
			year,
			indicator,
			humanDsgTable.sex,
		),
		disaggregationSumByColumn(
			countryAccountsId,
			year,
			indicator,
			humanDsgTable.age,
		),
		disaggregationSumByColumn(
			countryAccountsId,
			year,
			indicator,
			humanDsgTable.disability,
		),
		disaggregationSumByColumn(
			countryAccountsId,
			year,
			indicator,
			humanDsgTable.nationalPovertyLine,
		),
	]);

	const sexResult: Record<string, CountMetric> = {};
	if (sex.has("m")) sexResult.men = { total: sex.get("m") ?? null };
	if (sex.has("f")) sexResult.women = { total: sex.get("f") ?? null };

	const ageResult: Record<string, CountMetric> = {};
	if (age.has("0-14")) {
		ageResult["Children (0-14)"] = { total: age.get("0-14") ?? null };
	}
	if (age.has("15-64")) {
		ageResult["Adults (15-64)"] = { total: age.get("15-64") ?? null };
	}
	if (age.has("65+")) {
		ageResult["Seniors (65 +)"] = { total: age.get("65+") ?? null };
	}

	const disabilityResult: Record<string, CountMetric> = {};
	let disabilityTotal = 0;
	let hasDisabilityRows = false;
	for (const [key, value] of disability.entries()) {
		if (key === "none") continue;
		hasDisabilityRows = true;
		disabilityTotal += Number(value ?? 0);
	}
	if (hasDisabilityRows) {
		disabilityResult["Persons with disability"] = { total: disabilityTotal };
	}

	const incomeResult: Record<string, CountMetric> = {};
	if (income.has("below")) {
		incomeResult["Under national poverty line"] = {
			total: income.get("below") ?? null,
		};
	}

	return {
		Disability: disabilityResult,
		Sex: sexResult,
		Income: incomeResult,
		Age: ageResult,
	};
}

function emptyOtherDisaggregations(): Record<string, Record<string, CountMetric>> {
	return {
		Disability: {},
		Sex: {},
		Income: {},
		Age: {},
	};
}

async function housingSectorIds(): Promise<string[]> {
	const sectors = await dr
		.select({
			id: sectorTable.id,
			parentId: sectorTable.parentId,
			name: sectorTable.name,
		})
		.from(sectorTable);

	const matchesHousing = (name: unknown): boolean => {
		const label = jsonMapToLabel(name).toLowerCase();
		return label.includes("housing") || label.includes("dwell");
	};

	const byParent = new Map<string, string[]>();
	for (const sector of sectors) {
		if (!sector.parentId) continue;
		const list = byParent.get(sector.parentId) ?? [];
		list.push(sector.id);
		byParent.set(sector.parentId, list);
	}

	const selected = new Set<string>();
	const queue: string[] = [];
	for (const sector of sectors) {
		if (matchesHousing(sector.name)) {
			selected.add(sector.id);
			queue.push(sector.id);
		}
	}

	while (queue.length > 0) {
		const id = queue.shift()!;
		for (const childId of byParent.get(id) ?? []) {
			if (selected.has(childId)) continue;
			selected.add(childId);
			queue.push(childId);
		}
	}

	return Array.from(selected);
}

async function sumDamagesMetric(
	countryAccountsId: string,
	year: string,
	damageCol: typeof damagesTable.pdDamageAmount | typeof damagesTable.tdDamageAmount,
): Promise<number | null> {
	const sectorIds = await housingSectorIds();
	if (sectorIds.length === 0) return null;

	const rows = await dr
		.select({ sum: sql<number | null>`sum(${damageCol})` })
		.from(disasterRecordsTable)
		.innerJoin(damagesTable, eq(damagesTable.recordId, disasterRecordsTable.id))
		.where(
			and(
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				inArray(disasterRecordsTable.approvalStatus, APPROVAL_STATUSES as any),
				sql`substring(${disasterRecordsTable.startDate}, 1, 4) = ${year}`,
				inArray(damagesTable.sectorId, sectorIds),
			),
		);

	return rows[0]?.sum ?? null;
}

async function sumDamagesByHazard(
	countryAccountsId: string,
	year: string,
	damageCol: typeof damagesTable.pdDamageAmount | typeof damagesTable.tdDamageAmount,
): Promise<Record<string, CountMetric>> {
	const sectorIds = await housingSectorIds();
	if (sectorIds.length === 0) return {};

	const rows = await dr
		.select({
			hazardName: hipHazardTable.name,
			sum: sql<number | null>`sum(${damageCol})`,
		})
		.from(disasterRecordsTable)
		.innerJoin(damagesTable, eq(damagesTable.recordId, disasterRecordsTable.id))
		.leftJoin(
			disasterEventTable,
			eq(disasterEventTable.id, disasterRecordsTable.disasterEventId),
		)
		.leftJoin(
			hipHazardTable,
			sql`${hipHazardTable.id} = coalesce(${disasterRecordsTable.hipHazardId}, ${disasterEventTable.hipHazardId})`,
		)
		.where(
			and(
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				inArray(disasterRecordsTable.approvalStatus, APPROVAL_STATUSES as any),
				sql`substring(${disasterRecordsTable.startDate}, 1, 4) = ${year}`,
				inArray(damagesTable.sectorId, sectorIds),
				isNotNull(hipHazardTable.id),
			),
		)
		.groupBy(hipHazardTable.name);

	const hazards: Record<string, CountMetric> = {};
	for (const row of rows) {
		const label = jsonMapToLabel(row.hazardName);
		if (!label) continue;
		hazards[label] = { total: row.sum ?? null };
	}
	return hazards;
}

async function sumDamagesBySubdivision(
	countryAccountsId: string,
	year: string,
	damageCol: typeof damagesTable.pdDamageAmount | typeof damagesTable.tdDamageAmount,
): Promise<Record<string, CountMetric>> {
	const sectorIds = await housingSectorIds();
	if (sectorIds.length === 0) return {};

	const rows = await dr
		.select({
			divisionName: divisionTable.name,
			sum: sql<number | null>`sum(${damageCol})`,
		})
		.from(disasterRecordsTable)
		.innerJoin(damagesTable, eq(damagesTable.recordId, disasterRecordsTable.id))
		.innerJoin(
			disasterRecordsDivisionTable,
			eq(disasterRecordsDivisionTable.disasterRecordId, disasterRecordsTable.id),
		)
		.innerJoin(
			divisionTable,
			eq(divisionTable.id, disasterRecordsDivisionTable.divisionId),
		)
		.where(
			and(
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				inArray(disasterRecordsTable.approvalStatus, APPROVAL_STATUSES as any),
				sql`substring(${disasterRecordsTable.startDate}, 1, 4) = ${year}`,
				inArray(damagesTable.sectorId, sectorIds),
				eq(divisionTable.level, 1),
			),
		)
		.groupBy(divisionTable.name);

	const subdivisions: Record<string, CountMetric> = {};
	for (const row of rows) {
		const label = jsonMapToLabel(row.divisionName);
		if (!label) continue;
		subdivisions[label] = { total: row.sum ?? null };
	}
	return subdivisions;
}

const LIVELIHOOD_KEY =
	"number_of_persons_whose_livelihoods_related_to_sector_lost";

async function sumLivelihoods(countryAccountsId: string, year: string) {
	const rows = await dr
		.select({
			sum: sql<number | null>`sum(coalesce(${lossesTable.publicUnits},0) + coalesce(${lossesTable.privateUnits},0))`,
		})
		.from(disasterRecordsTable)
		.innerJoin(lossesTable, eq(lossesTable.recordId, disasterRecordsTable.id))
		.where(
			and(
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				inArray(disasterRecordsTable.approvalStatus, APPROVAL_STATUSES as any),
				sql`substring(${disasterRecordsTable.startDate}, 1, 4) = ${year}`,
				sql`(
					${lossesTable.relatedToAgriculture} = ${LIVELIHOOD_KEY}
					OR ${lossesTable.relatedToNotAgriculture} = ${LIVELIHOOD_KEY}
				)`,
			),
		);

	return rows[0]?.sum ?? null;
}

async function sumLivelihoodsByHazard(
	countryAccountsId: string,
	year: string,
): Promise<Record<string, CountMetric>> {
	const rows = await dr
		.select({
			hazardName: hipHazardTable.name,
			sum: sql<number | null>`sum(coalesce(${lossesTable.publicUnits},0) + coalesce(${lossesTable.privateUnits},0))`,
		})
		.from(disasterRecordsTable)
		.innerJoin(lossesTable, eq(lossesTable.recordId, disasterRecordsTable.id))
		.leftJoin(
			disasterEventTable,
			eq(disasterEventTable.id, disasterRecordsTable.disasterEventId),
		)
		.leftJoin(
			hipHazardTable,
			sql`${hipHazardTable.id} = coalesce(${disasterRecordsTable.hipHazardId}, ${disasterEventTable.hipHazardId})`,
		)
		.where(
			and(
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				inArray(disasterRecordsTable.approvalStatus, APPROVAL_STATUSES as any),
				sql`substring(${disasterRecordsTable.startDate}, 1, 4) = ${year}`,
				sql`(
					${lossesTable.relatedToAgriculture} = ${LIVELIHOOD_KEY}
					OR ${lossesTable.relatedToNotAgriculture} = ${LIVELIHOOD_KEY}
				)`,
				isNotNull(hipHazardTable.id),
			),
		)
		.groupBy(hipHazardTable.name);

	const hazards: Record<string, CountMetric> = {};
	for (const row of rows) {
		const label = jsonMapToLabel(row.hazardName);
		if (!label) continue;
		hazards[label] = { total: row.sum ?? null };
	}
	return hazards;
}

async function sumLivelihoodsBySubdivision(
	countryAccountsId: string,
	year: string,
): Promise<Record<string, CountMetric>> {
	const rows = await dr
		.select({
			divisionName: divisionTable.name,
			sum: sql<number | null>`sum(coalesce(${lossesTable.publicUnits},0) + coalesce(${lossesTable.privateUnits},0))`,
		})
		.from(disasterRecordsTable)
		.innerJoin(lossesTable, eq(lossesTable.recordId, disasterRecordsTable.id))
		.innerJoin(
			disasterRecordsDivisionTable,
			eq(disasterRecordsDivisionTable.disasterRecordId, disasterRecordsTable.id),
		)
		.innerJoin(
			divisionTable,
			eq(divisionTable.id, disasterRecordsDivisionTable.divisionId),
		)
		.where(
			and(
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				inArray(disasterRecordsTable.approvalStatus, APPROVAL_STATUSES as any),
				sql`substring(${disasterRecordsTable.startDate}, 1, 4) = ${year}`,
				sql`(
					${lossesTable.relatedToAgriculture} = ${LIVELIHOOD_KEY}
					OR ${lossesTable.relatedToNotAgriculture} = ${LIVELIHOOD_KEY}
				)`,
				eq(divisionTable.level, 1),
			),
		)
		.groupBy(divisionTable.name);

	const subdivisions: Record<string, CountMetric> = {};
	for (const row of rows) {
		const label = jsonMapToLabel(row.divisionName);
		if (!label) continue;
		subdivisions[label] = { total: row.sum ?? null };
	}
	return subdivisions;
}

function lossMetric(
	total: number | null,
	destroyed: number | null,
	damaged: number | null,
	economic: number | null,
): LossMetric {
	return { total, destroyed, damaged, economic };
}

type LossIndicatorConfig = {
	sectorMatcher: (nameLower: string) => boolean;
	totalExpr: any;
	damagedExpr: any;
	destroyedExpr: any;
	economicExpr: any;
};

const LOSS_INDICATOR_CONFIG: Record<string, LossIndicatorConfig> = {
	c4: {
		sectorMatcher: (nameLower) =>
			nameLower.includes("housing") || nameLower.includes("dwell"),
		totalExpr: sql`coalesce(${damagesTable.totalDamageAmount}, 0)`,
		damagedExpr: sql`coalesce(${damagesTable.pdDamageAmount}, 0)`,
		destroyedExpr: sql`coalesce(${damagesTable.tdDamageAmount}, 0)`,
		economicExpr: sql`coalesce(${damagesTable.totalRepairReplacement}, 0)`,
	},
	c5a: {
		sectorMatcher: (nameLower) =>
			nameLower.includes("health") ||
			nameLower.includes("hospital") ||
			nameLower.includes("medical"),
		totalExpr: sql`coalesce(${damagesTable.totalDamageAmount}, 0)`,
		damagedExpr: sql`coalesce(${damagesTable.pdDamageAmount}, 0)`,
		destroyedExpr: sql`coalesce(${damagesTable.tdDamageAmount}, 0)`,
		economicExpr: sql`coalesce(${damagesTable.totalRepairReplacement}, 0)`,
	},
	c5b: {
		sectorMatcher: (nameLower) =>
			nameLower.includes("education") || nameLower.includes("school"),
		totalExpr: sql`coalesce(${damagesTable.totalDamageAmount}, 0)`,
		damagedExpr: sql`coalesce(${damagesTable.pdDamageAmount}, 0)`,
		destroyedExpr: sql`coalesce(${damagesTable.tdDamageAmount}, 0)`,
		economicExpr: sql`coalesce(${damagesTable.totalRepairReplacement}, 0)`,
	},
	c5c: {
		sectorMatcher: (nameLower) =>
			nameLower.includes("infrastructure") ||
			nameLower.includes("transport") ||
			nameLower.includes("water") ||
			nameLower.includes("energy") ||
			nameLower.includes("communication"),
		totalExpr: sql`coalesce(${damagesTable.totalDamageAmount}, 0)`,
		damagedExpr: sql`coalesce(${damagesTable.pdDamageAmount}, 0)`,
		destroyedExpr: sql`coalesce(${damagesTable.tdDamageAmount}, 0)`,
		economicExpr: sql`coalesce(${damagesTable.totalRepairReplacement}, 0)`,
	},
};

async function sectorIdsByMatcher(
	matcher: (nameLower: string) => boolean,
): Promise<string[]> {
	const sectors = await dr
		.select({
			id: sectorTable.id,
			name: sectorTable.name,
		})
		.from(sectorTable);

	return sectors
		.filter((s) => matcher(jsonMapToLabel(s.name).toLowerCase()))
		.map((s) => s.id);
}

async function aggregateLossBase(
	countryAccountsId: string,
	year: string,
	sectorIds: string[],
	config: LossIndicatorConfig,
	groupBy: "none" | "hazard" | "division",
): Promise<any[]> {
	if (sectorIds.length === 0) return [];

	if (groupBy === "hazard") {
		return dr
			.select({
				hazardName: hipHazardTable.name,
				divisionName: sql<unknown>`null`.as("divisionName"),
				total: sql<number | null>`sum(${config.totalExpr})`,
				destroyed: sql<number | null>`sum(${config.destroyedExpr})`,
				damaged: sql<number | null>`sum(${config.damagedExpr})`,
				economic: sql<number | null>`sum(${config.economicExpr})`,
			})
			.from(disasterRecordsTable)
			.innerJoin(damagesTable, eq(damagesTable.recordId, disasterRecordsTable.id))
			.leftJoin(
				disasterEventTable,
				eq(disasterEventTable.id, disasterRecordsTable.disasterEventId),
			)
			.leftJoin(
				hipHazardTable,
				sql`${hipHazardTable.id} = coalesce(${disasterRecordsTable.hipHazardId}, ${disasterEventTable.hipHazardId})`,
			)
			.where(
				and(
					eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
					inArray(disasterRecordsTable.approvalStatus, APPROVAL_STATUSES as any),
					sql`substring(${disasterRecordsTable.startDate}, 1, 4) = ${year}`,
					inArray(damagesTable.sectorId, sectorIds),
					isNotNull(hipHazardTable.id),
				),
			)
			.groupBy(hipHazardTable.name);
	}

	if (groupBy === "division") {
		return dr
			.select({
				hazardName: sql<unknown>`null`.as("hazardName"),
				divisionName: divisionTable.name,
				total: sql<number | null>`sum(${config.totalExpr})`,
				destroyed: sql<number | null>`sum(${config.destroyedExpr})`,
				damaged: sql<number | null>`sum(${config.damagedExpr})`,
				economic: sql<number | null>`sum(${config.economicExpr})`,
			})
			.from(disasterRecordsTable)
			.innerJoin(damagesTable, eq(damagesTable.recordId, disasterRecordsTable.id))
			.innerJoin(
				disasterRecordsDivisionTable,
				eq(disasterRecordsDivisionTable.disasterRecordId, disasterRecordsTable.id),
			)
			.innerJoin(
				divisionTable,
				eq(divisionTable.id, disasterRecordsDivisionTable.divisionId),
			)
			.where(
				and(
					eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
					inArray(disasterRecordsTable.approvalStatus, APPROVAL_STATUSES as any),
					sql`substring(${disasterRecordsTable.startDate}, 1, 4) = ${year}`,
					inArray(damagesTable.sectorId, sectorIds),
					eq(divisionTable.level, 1),
				),
			)
			.groupBy(divisionTable.name);
	}

	return dr
		.select({
			hazardName: sql<unknown>`null`.as("hazardName"),
			divisionName: sql<unknown>`null`.as("divisionName"),
			total: sql<number | null>`sum(${config.totalExpr})`,
			destroyed: sql<number | null>`sum(${config.destroyedExpr})`,
			damaged: sql<number | null>`sum(${config.damagedExpr})`,
			economic: sql<number | null>`sum(${config.economicExpr})`,
		})
		.from(disasterRecordsTable)
		.innerJoin(damagesTable, eq(damagesTable.recordId, disasterRecordsTable.id))
		.where(
			and(
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				inArray(disasterRecordsTable.approvalStatus, APPROVAL_STATUSES as any),
				sql`substring(${disasterRecordsTable.startDate}, 1, 4) = ${year}`,
				inArray(damagesTable.sectorId, sectorIds),
			),
		);
}

async function aggregateLossIndicator(
	countryAccountsId: string,
	year: string,
	indicator: "c4" | "c5a" | "c5b" | "c5c",
): Promise<{
	value: LossMetric;
	hazards: Record<string, LossMetric>;
	subdivision1: Record<string, LossMetric>;
}> {
	const config = LOSS_INDICATOR_CONFIG[indicator];
	const sectorIds = await sectorIdsByMatcher(config.sectorMatcher);

	const [overallRows, hazardRows, divisionRows] = await Promise.all([
		aggregateLossBase(countryAccountsId, year, sectorIds, config, "none"),
		aggregateLossBase(countryAccountsId, year, sectorIds, config, "hazard"),
		aggregateLossBase(countryAccountsId, year, sectorIds, config, "division"),
	]);

	const o = overallRows[0];
	const value = lossMetric(
		o?.total ?? null,
		o?.destroyed ?? null,
		o?.damaged ?? null,
		o?.economic ?? null,
	);

	const hazards: Record<string, LossMetric> = {};
	for (const row of hazardRows) {
		const label = jsonMapToLabel(row.hazardName);
		if (!label) continue;
		hazards[label] = lossMetric(
			row.total ?? null,
			row.destroyed ?? null,
			row.damaged ?? null,
			row.economic ?? null,
		);
	}

	const subdivision1: Record<string, LossMetric> = {};
	for (const row of divisionRows) {
		const label = jsonMapToLabel(row.divisionName);
		if (!label) continue;
		subdivision1[label] = lossMetric(
			row.total ?? null,
			row.destroyed ?? null,
			row.damaged ?? null,
			row.economic ?? null,
		);
	}

	return { value, hazards, subdivision1 };
}

const DISRUPTION_INDICATOR_CONFIG = {
	d6: {
		matcher: (nameLower: string) => nameLower.includes("education"),
		col: disruptionTable.peopleAffected,
	},
	d7: {
		matcher: (nameLower: string) =>
			nameLower.includes("health") || nameLower.includes("hospital"),
		col: disruptionTable.peopleAffected,
	},
	d8: {
		matcher: (nameLower: string) =>
			nameLower.includes("transport") ||
			nameLower.includes("energy") ||
			nameLower.includes("communication") ||
			nameLower.includes("water") ||
			nameLower.includes("sewer") ||
			nameLower.includes("solid waste") ||
			nameLower.includes("administration") ||
			nameLower.includes("emergency"),
		col: disruptionTable.peopleAffected,
	},
} as const;

async function aggregateDisruptionIndicator(
	countryAccountsId: string,
	year: string,
	indicator: "d6" | "d7" | "d8",
): Promise<{
	value: CountMetric;
	hazards: Record<string, CountMetric>;
	subdivision1: Record<string, CountMetric>;
}> {
	const cfg = DISRUPTION_INDICATOR_CONFIG[indicator];
	const sectorIds = await sectorIdsByMatcher(cfg.matcher);
	if (sectorIds.length === 0) {
		return { value: { total: null }, hazards: {}, subdivision1: {} };
	}

	const baseWhere = [
		eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
		inArray(disasterRecordsTable.approvalStatus, APPROVAL_STATUSES as any),
		sql`substring(${disasterRecordsTable.startDate}, 1, 4) = ${year}`,
		inArray(disruptionTable.sectorId, sectorIds),
	] as any[];

	const overallRows = await dr
		.select({ sum: sql<number | null>`sum(${cfg.col})` })
		.from(disasterRecordsTable)
		.innerJoin(disruptionTable, eq(disruptionTable.recordId, disasterRecordsTable.id))
		.where(and(...baseWhere));

	const hazardRows = await dr
		.select({
			hazardName: hipHazardTable.name,
			sum: sql<number | null>`sum(${cfg.col})`,
		})
		.from(disasterRecordsTable)
		.innerJoin(disruptionTable, eq(disruptionTable.recordId, disasterRecordsTable.id))
		.leftJoin(
			disasterEventTable,
			eq(disasterEventTable.id, disasterRecordsTable.disasterEventId),
		)
		.leftJoin(
			hipHazardTable,
			sql`${hipHazardTable.id} = coalesce(${disasterRecordsTable.hipHazardId}, ${disasterEventTable.hipHazardId})`,
		)
		.where(and(...baseWhere, isNotNull(hipHazardTable.id)))
		.groupBy(hipHazardTable.name);

	const divisionRows = await dr
		.select({
			divisionName: divisionTable.name,
			sum: sql<number | null>`sum(${cfg.col})`,
		})
		.from(disasterRecordsTable)
		.innerJoin(disruptionTable, eq(disruptionTable.recordId, disasterRecordsTable.id))
		.innerJoin(
			disasterRecordsDivisionTable,
			eq(disasterRecordsDivisionTable.disasterRecordId, disasterRecordsTable.id),
		)
		.innerJoin(
			divisionTable,
			eq(divisionTable.id, disasterRecordsDivisionTable.divisionId),
		)
		.where(and(...baseWhere, eq(divisionTable.level, 1)))
		.groupBy(divisionTable.name);

	const value: CountMetric = { total: overallRows[0]?.sum ?? null };
	const hazards: Record<string, CountMetric> = {};
	for (const row of hazardRows) {
		const label = jsonMapToLabel(row.hazardName);
		if (!label) continue;
		hazards[label] = { total: row.sum ?? null };
	}
	const subdivision1: Record<string, CountMetric> = {};
	for (const row of divisionRows) {
		const label = jsonMapToLabel(row.divisionName);
		if (!label) continue;
		subdivision1[label] = { total: row.sum ?? null };
	}

	return { value, hazards, subdivision1 };
}


export async function getConsolidatedCountIndicator(args: {
	country: string;
	year: string;
	indicator: SupportedIndicator;
	countryAccountsId: string;
}): Promise<ConsolidatedResponse | null> {
	const { country, year, indicator, countryAccountsId } = args;
	const matches = await countryMatchesTenant(countryAccountsId, country);
	if (!matches) return null;

	if (indicator === "b3" || indicator === "b3a") {
		const [total, hazards, subdivision1] = await Promise.all([
			sumDamagesMetric(countryAccountsId, year, damagesTable.pdDamageAmount),
			sumDamagesByHazard(countryAccountsId, year, damagesTable.pdDamageAmount),
			sumDamagesBySubdivision(
				countryAccountsId,
				year,
				damagesTable.pdDamageAmount,
			),
		]);

		return {
			ctycode: country,
			year,
			indicator,
			value: { total },
			source: "DesInventar Official database",
			hazards,
			subdivision1,
			otherdisaggregation: emptyOtherDisaggregations(),
		};
	}

	if (indicator === "b4" || indicator === "b4a") {
		const [total, hazards, subdivision1] = await Promise.all([
			sumDamagesMetric(countryAccountsId, year, damagesTable.tdDamageAmount),
			sumDamagesByHazard(countryAccountsId, year, damagesTable.tdDamageAmount),
			sumDamagesBySubdivision(
				countryAccountsId,
				year,
				damagesTable.tdDamageAmount,
			),
		]);

		return {
			ctycode: country,
			year,
			indicator,
			value: { total },
			source: "DesInventar Official database",
			hazards,
			subdivision1,
			otherdisaggregation: emptyOtherDisaggregations(),
		};
	}

	if (indicator === "b5") {
		const [total, hazards, subdivision1] = await Promise.all([
			sumLivelihoods(countryAccountsId, year),
			sumLivelihoodsByHazard(countryAccountsId, year),
			sumLivelihoodsBySubdivision(countryAccountsId, year),
		]);

		return {
			ctycode: country,
			year,
			indicator,
			value: { total },
			source: "DesInventar Official database",
			hazards,
			subdivision1,
			otherdisaggregation: emptyOtherDisaggregations(),
		};
	}

	if (
		indicator === "c4" ||
		indicator === "c5a" ||
		indicator === "c5b" ||
		indicator === "c5c"
	) {
		const { value, hazards, subdivision1 } = await aggregateLossIndicator(
			countryAccountsId,
			year,
			indicator,
		);

		return {
			ctycode: country,
			year,
			indicator,
			value,
			source: "DesInventar Official database",
			hazards,
			subdivision1,
			otherdisaggregation: emptyOtherDisaggregations(),
		};
	}

	if (indicator === "d6" || indicator === "d7" || indicator === "d8") {
		const { value, hazards, subdivision1 } = await aggregateDisruptionIndicator(
			countryAccountsId,
			year,
			indicator,
		);

		return {
			ctycode: country,
			year,
			indicator,
			value,
			source: "DesInventar Official database",
			hazards,
			subdivision1,
			otherdisaggregation: emptyOtherDisaggregations(),
		};
	}

	const [total, hazards, subdivision1, other] = await Promise.all([
		totalByIndicator(countryAccountsId, year, indicator as SupportedCountIndicator),
		totalsByHazard(countryAccountsId, year, indicator as SupportedCountIndicator),
		totalsBySubdivisionLevel1(
			countryAccountsId,
			year,
			indicator as SupportedCountIndicator,
		),
		otherDisaggregations(
			countryAccountsId,
			year,
			indicator as SupportedCountIndicator,
		),
	]);

	return {
		ctycode: country,
		year,
		indicator,
		value: { total },
		source: "DesInventar Official database",
		hazards,
		subdivision1,
		otherdisaggregation: other,
	};
}
