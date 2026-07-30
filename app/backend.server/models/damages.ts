import { dr, Tx } from "~/db.server";
import { disasterRecordsTable } from "~/drizzle/schema/disasterRecordsTable";
import { assetTable } from "~/drizzle/schema/assetTable";
import { damagesTable, InsertDamages } from "~/drizzle/schema/damagesTable";
import { damagesGeomTable } from "~/drizzle/schema/damagesGeomTable";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { DamagesGeomRepository } from "~/db/queries/damagesGeomRepository";
import { DamagesDivisionRepository } from "~/db/queries/damagesDivisionRepository";
import { sql, and, eq, inArray } from "drizzle-orm";

import {
	CreateResult,
	DeleteResult,
	UpdateResult,
} from "~/backend.server/handlers/form/form";
import { Errors, FormInputDef, hasErrors } from "~/frontend/form";
import { unitsEnum } from "~/frontend/unit_picker";
import { updateTotalsUsingDisasterRecordId } from "./analytics/disaster-events-cost-calculator";
import { DisasterRecordsRepository } from "~/db/queries/disasterRecordsRepository";
import { BackendContext } from "../context";

export interface DamagesFields extends Omit<InsertDamages, "id"> {
	spatialFootprint?: unknown;
}

type SpatialFootprintItem = {
	id?: string;
	title?: string;
	map_option?: string;
	geojson?: any;
	geographic_level?: string;
	[key: string]: unknown;
};

function parseSpatialFootprintItems(value: unknown): SpatialFootprintItem[] {
	if (Array.isArray(value)) {
		return value.filter((item): item is SpatialFootprintItem => !!item);
	}

	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			return Array.isArray(parsed)
				? parsed.filter((item): item is SpatialFootprintItem => !!item)
				: [];
		} catch {
			return [];
		}
	}

	return [];
}

function extractGeojsonGeometry(item: SpatialFootprintItem) {
	if (item?.geojson && typeof item.geojson === "object") {
		const geojson = item.geojson as any;
		if (geojson.geometry) {
			return geojson.geometry;
		}
		return geojson;
	}

	return null;
}

async function syncDamagesSpatialFootprint(
	tx: Tx,
	damageId: string,
	spatialFootprintValue: unknown,
) {
	const items = parseSpatialFootprintItems(spatialFootprintValue);
	const mapCoordinateItems = items.filter(
		(item) => item.map_option === "Map coordinates",
	);
	const geographicItems = items.filter(
		(item) => item.map_option === "Geographic level",
	);

	await DamagesGeomRepository.deleteByDamageId(damageId, tx);
	await DamagesDivisionRepository.deleteByDamageId(damageId, tx);

	if (mapCoordinateItems.length > 0) {
		await DamagesGeomRepository.createMany(
			mapCoordinateItems
				.map((item) => {
					const geometry = extractGeojsonGeometry(item);
					if (!geometry) {
						return null;
					}

					return {
						damageId,
						title: typeof item.title === "string" ? item.title : null,
						geom: sql`ST_MakeValid(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}))`,
					};
				})
				.filter((item): item is NonNullable<typeof item> => item !== null),
			tx,
		);
	}

	if (geographicItems.length > 0) {
		const divisionIds = Array.from(
			new Set(
				geographicItems
					.map((item) => String(item?.geojson?.properties?.division_id ?? ""))
					.filter((value) => value.length > 0),
			),
		);

		if (divisionIds.length > 0) {
			const validDivisions = await tx
				.select({ id: divisionTable.id })
				.from(divisionTable)
				.where(inArray(divisionTable.id, divisionIds));

			const validDivisionIds = new Set(validDivisions.map((row) => row.id));
			const rows = geographicItems
				.map((item) => String(item?.geojson?.properties?.division_id ?? ""))
				.filter((value) => validDivisionIds.has(value))
				.map((divisionId) => ({
					damageId,
					divisionId,
				}));

			if (rows.length > 0) {
				await DamagesDivisionRepository.createMany(rows, tx);
			}
		}
	}
}

async function loadDamagesSpatialFootprint(tx: Tx, damageId: string) {
	const [geomRows, divisionRows] = await Promise.all([
		tx
			.select({
				id: damagesGeomTable.id,
				title: damagesGeomTable.title,
				geom: sql<string>`ST_AsGeoJSON(${damagesGeomTable.geom})`,
			})
			.from(damagesGeomTable)
			.where(eq(damagesGeomTable.damageId, damageId)),
		DamagesDivisionRepository.getByDamageId(damageId, tx),
	]);

	const divisionIds = divisionRows.map(
		(row: { divisionId: string }) => row.divisionId,
	);
	const divisionDetails = divisionIds.length
		? await tx
				.select({
					id: divisionTable.id,
					name: divisionTable.name,
					geojson: divisionTable.geojson,
					importId: divisionTable.importId,
					nationalId: divisionTable.nationalId,
					level: divisionTable.level,
				})
				.from(divisionTable)
				.where(inArray(divisionTable.id, divisionIds))
		: [];

	const divisionsById = new Map(
		divisionDetails.map((row: (typeof divisionDetails)[number]) => [
			row.id,
			row,
		]),
	);

	const mapCoordinates = geomRows
		.map((row: (typeof geomRows)[number]) => {
			if (!row.geom || typeof row.geom !== "string") {
				return null;
			}

			try {
				const geometry = JSON.parse(row.geom);
				return {
					id: row.id,
					title: row.title,
					map_option: "Map coordinates",
					geojson: {
						type: "Feature",
						geometry,
						properties: {},
					},
				};
			} catch {
				return null;
			}
		})
		.filter((item): item is NonNullable<typeof item> => item !== null);

	const geographic = divisionRows
		.map((row: { divisionId: string }) => divisionsById.get(row.divisionId))
		.filter((division): division is NonNullable<typeof division> => !!division)
		.map((division: NonNullable<(typeof divisionDetails)[number]>) => {
			const geojson = division.geojson as any;
			const nameObject = division.name as Record<string, string> | null;
			const title =
				nameObject?.en || Object.values(nameObject || {})[0] || division.id;

			return {
				id: `geographic-${division.id}`,
				title,
				map_option: "Geographic level",
				geographic_level: title,
				geojson:
					geojson && typeof geojson === "object"
						? {
								...(geojson.type === "Feature"
									? geojson
									: { type: "Feature", geometry: geojson, properties: {} }),
								properties: {
									...((geojson as any)?.properties || {}),
									division_id: division.id,
									division_ids: [division.id],
									import_id: division.importId,
									national_id: division.nationalId,
									level: division.level,
									name: division.name,
								},
							}
						: null,
			};
		});

	return [...mapCoordinates, ...geographic];
}

export function fieldsForPd(
	ctx: BackendContext,
	pre: "pd" | "td",
	currencies?: string[],
): FormInputDef<DamagesFields>[] {
	let repairOrReplacement = pre == "pd" ? "Repair" : "Replacement";
	if (!currencies) {
		currencies = [];
	}
	return [
		{
			key: (pre + "DamageAmount") as keyof DamagesFields,
			label: ctx.t({
				code: "disaster_record.damages.amount_of_units",
				msg: "Amount of units",
			}),
			type: "number",
			uiRow: {},
		},
		{
			key: (pre + repairOrReplacement + "CostUnit") as keyof DamagesFields,
			label: ctx.t(
				{
					code: "disaster_record.damages.unit_repair_or_replacement_cost",
					msg: "Unit {repairOrReplacement} cost",
				},
				{ repairOrReplacement: repairOrReplacement.toLowerCase() },
			),
			type: "money",
			uiRow: {},
		},
		{
			key: (pre +
				repairOrReplacement +
				"CostUnitCurrency") as keyof DamagesFields,
			label: ctx.t({
				code: "disaster_record.damages.currency",
				msg: "Currency",
			}),
			type: "enum-flex",
			enumData: currencies.map((c) => ({ key: c, label: c })),
		},
		{
			key: (pre + repairOrReplacement + "CostTotal") as keyof DamagesFields,
			label: ctx.t(
				{
					code: "disaster_record.damages.total_repair_or_replacement_cost",
					msg: "Total {repairOrReplacement} cost",
				},
				{ repairOrReplacement: repairOrReplacement.toLowerCase() },
			),
			type: "money",
		},
		{
			key: (pre +
				repairOrReplacement +
				"CostTotalOverride") as keyof DamagesFields,
			label: ctx.t({
				code: "disaster_record.damages.override",
				msg: "Override",
			}),
			type: "bool",
		},
		{
			key: (pre + "RecoveryCostUnit") as keyof DamagesFields,
			label: ctx.t({
				code: "disaster_record.damages.unit_recovery_cost",
				msg: "Unit recovery cost",
			}),
			type: "money",
			uiRow: {},
		},

		{
			key: (pre + "RecoveryCostUnitCurrency") as keyof DamagesFields,
			label: ctx.t({
				code: "disaster_record.damages.currency",
				msg: "Currency",
			}),
			type: "enum-flex",
			enumData: currencies.map((c) => ({ key: c, label: c })),
		},
		{
			key: (pre + "RecoveryCostTotal") as keyof DamagesFields,
			label: ctx.t({
				code: "disaster_record.damages.total_recovery_cost",
				msg: "Total recovery cost",
			}),
			type: "money",
		},
		{
			key: (pre + "RecoveryCostTotalOverride") as keyof DamagesFields,
			label: ctx.t({
				code: "disaster_record.damages.override",
				msg: "Override",
			}),
			type: "bool",
		},
		{
			key: (pre + "DisruptionDurationDays") as keyof DamagesFields,
			label: ctx.t({
				code: "disaster_record.damages.duration_days",
				msg: "Duration (days)",
			}),
			type: "number",
			uiRow: {},
		},
		{
			key: (pre + "DisruptionDurationHours") as keyof DamagesFields,
			label: ctx.t({
				code: "disaster_record.damages.duration_hours",
				msg: "Duration (hours)",
			}),
			type: "number",
		},
		{
			key: (pre + "DisruptionUsersAffected") as keyof DamagesFields,
			label: ctx.t({
				code: "disaster_record.damages.number_of_users_affected",
				msg: "Number of users affected",
			}),
			type: "number",
		},
		{
			key: (pre + "DisruptionPeopleAffected") as keyof DamagesFields,
			label: ctx.t({
				code: "disaster_record.damages.number_of_people_affected",
				msg: "Number of people affected",
			}),
			type: "number",
		},
		{
			key: (pre + "DisruptionDescription") as keyof DamagesFields,
			label: ctx.t({
				code: "disaster_record.damages.comment",
				msg: "Comment",
			}),
			type: "textarea",
			uiRowNew: true,
		},
	];
}

export async function fieldsDef(
	ctx: BackendContext,
	currencies?: string[],
): Promise<FormInputDef<DamagesFields>[]> {
	let currency = "";
	if (currencies && currencies.length > 0) {
		currency = currencies[0];
	}

	return [
		{
			key: "recordId",
			label: "Disaster Record ID",
			type: "uuid",
			mcpDescription:
				"ID of the disaster record this damage belongs to. Use disaster-record_list to get available IDs.",
		},
		{
			key: "sectorId",
			label: "Sector ID",
			type: "uuid",
			mcpDescription:
				"ID of the sector. Use sector_list to get available IDs. Must match a sector that the asset belongs to.",
		},
		{
			key: "assetId",
			label: ctx.t({
				code: "disaster_record.damages.assets",
				msg: "Assets",
			}),
			type: "uuid",
			mcpDescription:
				"ID of the asset. Use asset_list to get available IDs. The asset must belong to the selected sector (check asset's sectorIds field).",
		},
		{
			key: "unit",
			label: ctx.t({
				code: "disaster_record.damages.unit",
				msg: "Unit",
			}),
			type: "enum",
			enumData: unitsEnum,
		},
		{
			key: "totalDamageAmount",
			label: ctx.t({
				code: "disaster_record.damages.total_damage_amount",
				msg: "Total number of assets affected (partially damaged + totally destroyed)",
			}),
			type: "number",
			uiRow: {},
		},
		{
			key: "totalDamageAmountOverride",
			label: ctx.t({
				code: "disaster_record.damages.override",
				msg: "Override",
			}),
			type: "bool",
		},
		{
			key: "totalRecovery",
			label: ctx.t(
				{
					code: "disaster_record.damages.total_recovery",
					msg: "Total recovery cost ({currency})",
				},
				{ currency },
			),
			type: "money",
		},
		{
			key: "totalRecoveryOverride",
			label: ctx.t({
				code: "disaster_record.damages.override",
				msg: "Override",
			}),
			type: "bool",
		},
		{
			key: "totalRepairReplacement",
			label: ctx.t(
				{
					code: "disaster_record.damages.total_repair_replacement",
					msg: "Total damage in monetary terms (total repair + replacement cost) ({currency})",
				},
				{ currency },
			),
			type: "money",
		},
		{
			key: "totalRepairReplacementOverride",
			label: ctx.t({
				code: "disaster_record.damages.override",
				msg: "Override",
			}),
			type: "bool",
		},

		// Partially destroyed
		...fieldsForPd(ctx, "pd", currencies),
		// Totally damaged
		...fieldsForPd(ctx, "td", currencies),
		{
			key: "spatialFootprint",
			label: ctx.t({
				code: "spatial_footprint",
				msg: "Spatial footprint",
			}),
			type: "other",
			psqlType: "jsonb",
		},
		{
			key: "attachments",
			label: ctx.t({
				code: "attachments",
				msg: "Attachments",
			}),
			type: "other",
			psqlType: "jsonb",
		},
	];
}

export async function fieldsDefApi(
	ctx: BackendContext,
	currencies: string[],
): Promise<FormInputDef<DamagesFields>[]> {
	return [
		...(await fieldsDef(ctx, currencies)),
		{ key: "apiImportId", label: "", type: "other" },
	];
}

export async function fieldsDefView(
	ctx: BackendContext,
	currencies: string[],
): Promise<FormInputDef<DamagesFields>[]> {
	return fieldsDef(ctx, currencies);
}

export function validate(
	fields: Partial<DamagesFields>,
): Errors<DamagesFields> {
	let errors: Errors<DamagesFields> = { fields: {} };
	let msg = "must be >= 0";
	let check = (k: keyof DamagesFields) => {
		if (fields[k] != null && (fields[k] as number) < 0)
			errors.fields![k] = [msg];
	};
	let keys = [
		"totalDamageAmount",
		"totalRepairReplacementRecovery",
		"pdRepairCostUnit",
		"pdRepairUnits",
		"pdRepairCostTotal",
		"pdRecoveryCostUnit",
		"pdRecoveryUnits",
		"pdRecoveryCostTotal",
		"pdDisruptionDurationDays",
		"pdDisruptionDurationHours",
		"pdDisruptionUsersAffected",
		"pdDisruptionPeopleAffected",
		"tdReplacementCostUnit",
		"tdReplacementUnits",
		"tdReplacementCostTotal",
		"tdRecoveryCostUnit",
		"tdRecoveryUnits",
		"tdRecoveryCostTotal",
		"tdDisruptionDurationDays",
		"tdDisruptionDurationHours",
		"tdDisruptionUsersAffected",
		"tdDisruptionPeopleAffected",
	];
	keys.forEach((k) => check(k as keyof DamagesFields));
	return errors;
}

export async function damagesCreate(
	_ctx: BackendContext,
	tx: Tx,
	fields: DamagesFields,
): Promise<CreateResult<DamagesFields>> {
	let errors = validate(fields);
	if (hasErrors(errors)) return { ok: false, errors };

	const spatialFootprintValue = (fields as any).spatialFootprint;
	const { spatialFootprint: _ignoredSpatialFootprint, ...insertValues } =
		fields as any;

	const res = await tx
		.insert(damagesTable)
		.values({ ...insertValues })
		.returning({ id: damagesTable.id });

	await syncDamagesSpatialFootprint(tx, res[0].id, spatialFootprintValue);

	await updateTotalsUsingDisasterRecordId(tx, fields.recordId);

	return { ok: true, id: res[0].id };
}

export async function damagesUpdate(
	_ctx: BackendContext,
	tx: Tx,
	id: string,
	fields: Partial<DamagesFields>,
): Promise<UpdateResult<DamagesFields>> {
	let errors = validate(fields);
	if (hasErrors(errors)) return { ok: false, errors };

	const spatialFootprintValue = (fields as any).spatialFootprint;
	const { spatialFootprint: _ignoredSpatialFootprint, ...updateValues } =
		fields as any;

	await tx
		.update(damagesTable)
		.set({ ...updateValues })
		.where(eq(damagesTable.id, id));

	if ("spatialFootprint" in fields) {
		await syncDamagesSpatialFootprint(tx, id, spatialFootprintValue);
	}

	let recordId = await getRecordId(tx, id);
	await updateTotalsUsingDisasterRecordId(tx, recordId);

	return { ok: true };
}
export async function damagesUpdateByIdAndCountryAccountsId(
	_ctx: BackendContext,
	tx: Tx,
	id: string,
	countryAccountsId: string,
	fields: Partial<DamagesFields>,
): Promise<UpdateResult<DamagesFields>> {
	let errors = validate(fields);
	if (hasErrors(errors)) return { ok: false, errors };

	const spatialFootprintValue = (fields as any).spatialFootprint;
	const { spatialFootprint: _ignoredSpatialFootprint, ...updateValues } =
		fields as any;

	let recordId = await getRecordId(tx, id);
	const disasterRecords =
		await DisasterRecordsRepository.getByIdAndCountryAccountsId(
			recordId,
			countryAccountsId,
			tx,
		);
	if (!disasterRecords || disasterRecords.length === 0) {
		return {
			ok: false,
			errors: {
				general: ["No matching disaster record found or you don't have access"],
			},
		};
	}

	await tx
		.update(damagesTable)
		.set({ ...updateValues })
		.where(eq(damagesTable.id, id));

	if ("spatialFootprint" in fields) {
		await syncDamagesSpatialFootprint(tx, id, spatialFootprintValue);
	}

	await updateTotalsUsingDisasterRecordId(tx, recordId);

	return { ok: true };
}

export async function getRecordId(tx: Tx, id: string) {
	let rows = await tx
		.select({
			recordId: damagesTable.recordId,
		})
		.from(damagesTable)
		.where(eq(damagesTable.id, id))
		.execute();
	if (!rows.length) throw new Error("not found by id");
	return rows[0].recordId;
}

export async function damagesIdByImportId(tx: Tx, importId: string) {
	const res = await tx
		.select({ id: damagesTable.id })
		.from(damagesTable)
		.where(eq(damagesTable.apiImportId, importId));
	return res.length == 0 ? null : String(res[0].id);
}
// BUG: join on sectorId looks wrong — should probably be recordId to link through the disaster record for tenant scoping
export async function damagesIdByImportIdAndCountryAccountsId(
	tx: Tx,
	importId: string,
	countryAccountsId: string,
) {
	const res = await tx
		.select({ id: damagesTable.id })
		.from(damagesTable)
		.innerJoin(
			disasterRecordsTable,
			eq(damagesTable.sectorId, disasterRecordsTable.id),
		)
		.where(
			and(
				eq(damagesTable.apiImportId, importId),
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
			),
		);
	return res.length == 0 ? null : String(res[0].id);
}

export type DamagesViewModel = Exclude<
	Awaited<ReturnType<typeof damagesById>>,
	undefined | null
>;
export async function damagesById(ctx: BackendContext, id: string) {
	return damagesByIdTx(ctx, dr, id);
}

export async function damagesByIdTx(ctx: BackendContext, tx: Tx, id: string) {
	let res = await tx.query.damagesTable.findFirst({
		where: eq(damagesTable.id, id),
		with: {
			asset: {
				columns: {
					id: true,
				},
				extras: {
					name: sql<string>`CASE
			WHEN ${assetTable.isBuiltIn} THEN dts_jsonb_localized(${assetTable.builtInName}, ${ctx.lang})
			ELSE ${assetTable.customName}
		END`.as("name"),
				},
			},
		},
	});
	if (!res) return null;

	const spatialFootprint = await loadDamagesSpatialFootprint(tx, id);
	return {
		...res,
		spatialFootprint,
	};
}

export async function damagesByIdAndCountryAccountsId(
	ctx: BackendContext,
	id: string,
	countryAccountsId: string,
) {
	return damagesByIdAndCountryAccountsIdTx(ctx, dr, id, countryAccountsId);
}

export async function damagesByIdAndCountryAccountsIdTx(
	ctx: BackendContext,
	tx: Tx,
	id: string,
	countryAccountsId: string,
) {
	let res = await tx.query.damagesTable.findFirst({
		where: eq(damagesTable.id, id),
		with: {
			asset: {
				columns: { id: true },
				extras: {
					name: sql<string>`CASE
            WHEN ${assetTable.isBuiltIn} THEN dts_jsonb_localized(${assetTable.builtInName}, ${ctx.lang})
            ELSE ${assetTable.customName}
          END`.as("name"),
				},
			},
			disasterRecord: {
				columns: { countryAccountsId: true },
			},
		},
	});
	if (!res) return null;
	if (res.disasterRecord.countryAccountsId !== countryAccountsId) return null;

	const spatialFootprint = await loadDamagesSpatialFootprint(tx, id);
	return {
		...res,
		spatialFootprint,
	};
}

export async function damagesDeleteById(
	id: string,
	countryAccountsId: string,
): Promise<DeleteResult> {
	const record = await dr
		.select({ recordId: damagesTable.recordId })
		.from(damagesTable)
		.innerJoin(
			disasterRecordsTable,
			eq(damagesTable.recordId, disasterRecordsTable.id),
		)
		.where(
			and(
				eq(damagesTable.id, id),
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
			),
		)
		.execute();

	if (record.length === 0) {
		return {
			ok: false,
			error: "No matching record found or you don't have access",
		};
	}

	await dr.delete(damagesTable).where(eq(damagesTable.id, id));

	return { ok: true };
}

export async function damagesDeleteBySectorId(
	id: string,
): Promise<DeleteResult> {
	await dr.delete(damagesTable).where(eq(damagesTable.sectorId, id));

	return { ok: true };
}
