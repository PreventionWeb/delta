import { dr, Tx } from "~/db.server";
import { disasterRecordsTable } from "~/drizzle/schema/disasterRecordsTable";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { lossesGeomTable } from "~/drizzle/schema/lossesGeomTable";
import { lossesTable, InsertLosses } from "~/drizzle/schema/lossesTable";
import { and, eq, inArray, sql } from "drizzle-orm";

import {
	CreateResult,
	DeleteResult,
	UpdateResult,
} from "~/backend.server/handlers/form/form";
import { Errors, FormInputDef, hasErrors } from "~/frontend/form";
import { unitsEnum } from "~/frontend/unit_picker";
import {
	typeEnumAgriculture,
	typeEnumNotAgriculture,
} from "~/frontend/losses_enums";
import { DisasterRecordsRepository } from "~/db/queries/disasterRecordsRepository";
import { LossesGeomRepository } from "~/db/queries/lossesGeomRepository";
import { LossesDivisionRepository } from "~/db/queries/lossesDivisionRepository";
import { BackendContext } from "../context";
import { DContext } from "~/utils/dcontext";

export interface LossesFields extends Omit<InsertLosses, "id"> {
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

async function syncLossesSpatialFootprint(
	tx: Tx,
	lossId: string,
	spatialFootprintValue: unknown,
) {
	const items = parseSpatialFootprintItems(spatialFootprintValue);
	const mapCoordinateItems = items.filter(
		(item) => item.map_option === "Map coordinates",
	);
	const geographicItems = items.filter(
		(item) => item.map_option === "Geographic level",
	);

	await LossesGeomRepository.deleteByLossId(lossId, tx);
	await LossesDivisionRepository.deleteByLossId(lossId, tx);

	if (mapCoordinateItems.length > 0) {
		await LossesGeomRepository.createMany(
			mapCoordinateItems
				.map((item) => {
					const geometry = extractGeojsonGeometry(item);
					if (!geometry) {
						return null;
					}

					return {
						lossId,
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
					lossId,
					divisionId,
				}));

			if (rows.length > 0) {
				await LossesDivisionRepository.createMany(rows, tx);
			}
		}
	}
}

async function loadLossesSpatialFootprint(tx: Tx, lossId: string) {
	const [geomRows, divisionRows] = await Promise.all([
		tx
			.select({
				id: lossesGeomTable.id,
				title: lossesGeomTable.title,
				geom: sql<string>`ST_AsGeoJSON(${lossesGeomTable.geom})`,
			})
			.from(lossesGeomTable)
			.where(eq(lossesGeomTable.lossId, lossId)),
		LossesDivisionRepository.getByLossId(lossId, tx),
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

export function fieldsForPubOrPriv(
	ctx: DContext,
	pub: boolean,
	currencies?: string[],
): FormInputDef<LossesFields>[] {
	let pre = pub ? "public" : "private";

	if (!currencies) {
		currencies = ["USD"];
	}

	return [
		{
			key: (pre + "Unit") as keyof LossesFields,
			label: ctx.t({
				code: "disaster_records.losses.value_unit",
				msg: "Value Unit",
			}),
			type: "enum",
			enumData: unitsEnum,
			uiRow: { colOverride: 5 },
		},
		{
			key: (pre + "Units") as keyof LossesFields,
			label: ctx.t({ code: "disaster_records.losses.value", msg: "Value" }),
			type: "number",
		},
		{
			key: (pre + "CostUnit") as keyof LossesFields,
			label: ctx.t({
				code: "disaster_records.losses.cost_per_unit",
				msg: "Cost per unit",
			}),
			type: "money",
		},
		{
			key: (pre + "CostUnitCurrency") as keyof LossesFields,
			label: ctx.t({
				code: "disaster_records.losses.cost_currency",
				msg: "Cost currency",
			}),
			type: "enum-flex",
			enumData: currencies.map((c) => ({ key: c, label: c })),
		},
		{
			key: (pre + "CostTotal") as keyof LossesFields,
			label: ctx.t({
				code: "disaster_records.losses.total_cost",
				msg: "Total cost",
			}),
			type: "money",
			uiRow: {},
		},
		{
			key: (pre + "CostTotalOverride") as keyof LossesFields,
			label: ctx.t({ code: "common.override", msg: "Override" }),
			type: "bool",
		},
	];
}

// export function fieldsDef(): FormInputDef<LossesFields>[] {
export const createFieldsDef = (ctx: DContext, currencies: string[]) => {
	const fieldsDef: FormInputDef<LossesFields>[] = [
		{ key: "recordId", label: "", type: "uuid" },
		{ key: "sectorId", label: "", type: "other" },
		{ key: "sectorIsAgriculture", label: "", type: "bool" },
		{
			key: "typeNotAgriculture",
			label: ctx.t({ code: "common.type", msg: "Type" }),
			type: "enum",
			enumData: [
				{
					key: "infrastructure_temporary",
					label: ctx.t({
						code: "disaster_records.losses.infrastructure_temporary",
						msg: "Infrastructure- temporary for service/production continuity",
					}),
				},
				{
					key: "production_service_delivery_and_availability",
					label: ctx.t({
						code: "disaster_records.losses.production_service_delivery_and_availability",
						msg: "Production, Service delivery and availability of/access to goods and services",
					}),
				},
				{
					key: "governance_and_decision_making",
					label: ctx.t({
						code: "disaster_records.losses.governance_and_decision_making",
						msg: "Governance and decision-making",
					}),
				},
				{
					key: "risk_and_vulnerabilities",
					label: ctx.t({
						code: "disaster_records.losses.risk_and_vulnerabilities",
						msg: "Risk and vulnerabilities",
					}),
				},
				{
					key: "other_losses",
					label: ctx.t({
						code: "disaster_records.losses.other_losses",
						msg: "Other losses",
					}),
				},
				{
					key: "employment_and_livelihoods_losses",
					label: ctx.t({
						code: "disaster_records.losses.employment_and_livelihoods_losses",
						msg: "Employment and Livelihoods losses",
					}),
				},
			],
			uiRow: {},
		},
		{
			key: "typeAgriculture",
			label: ctx.t({ code: "common.type", msg: "Type" }),
			type: "enum",
			enumData: [
				{
					key: "infrastructure_temporary",
					label: ctx.t({
						code: "disaster_records.losses.infrastructure_temporary",
						msg: "Infrastructure- temporary for service/production continuity",
					}),
				},
				{
					key: "production_losses",
					label: ctx.t({
						code: "disaster_records.losses.production_losses",
						msg: "Production losses",
					}),
				},
				{
					key: "production_service_delivery_and_availability",
					label: ctx.t({
						code: "disaster_records.losses.production_service_delivery_and_availability",
						msg: "Production, Service delivery and availability of/access to goods and services",
					}),
				},
				{
					key: "governance_and_decision_making",
					label: ctx.t({
						code: "disaster_records.losses.governance_and_decision_making",
						msg: "Governance and decision-making",
					}),
				},
				{
					key: "risk_and_vulnerabilities",
					label: ctx.t({
						code: "disaster_records.losses.risk_and_vulnerabilities",
						msg: "Risk and vulnerabilities",
					}),
				},
				{
					key: "other_losses",
					label: ctx.t({
						code: "disaster_records.losses.other_losses",
						msg: "Other losses",
					}),
				},
				{
					key: "employment_and_livelihoods_losses",
					label: ctx.t({
						code: "disaster_records.losses.employment_and_livelihoods_losses",
						msg: "Employment and Livelihoods losses",
					}),
				},
			],
			uiRow: {},
		},
		{
			key: "relatedToNotAgriculture",
			label: ctx.t({
				code: "disaster_records.losses.related_to",
				msg: "Related To",
			}),
			type: "enum",
			enumData: typeEnumNotAgriculture(ctx).map((v) => ({
				key: v.key,
				label: v.label,
			})),
		},
		{
			key: "relatedToAgriculture",
			label: ctx.t({
				code: "disaster_records.losses.related_to",
				msg: "Related To",
			}),
			type: "enum",
			enumData: typeEnumAgriculture(ctx).map((v) => ({
				key: v.key,
				label: v.label,
			})),
		},
		{
			key: "description",
			label: ctx.t({ code: "common.description", msg: "Description" }),
			type: "textarea",
			uiRowNew: true,
		},

		// Public
		...fieldsForPubOrPriv(ctx, true, currencies),
		// Private
		...fieldsForPubOrPriv(ctx, false, currencies),
		{
			key: "spatialFootprint",
			label: ctx.t({
				code: "spatial_footprint",
				msg: "Spatial footprint",
			}),
			type: "other",
			psqlType: "jsonb",
			uiRowNew: true,
		},
		{
			key: "attachments",
			label: ctx.t({ code: "common.attachments", msg: "Attachments" }),
			type: "other",
			psqlType: "jsonb",
			uiRowNew: true,
		},
	];
	return fieldsDef;
};

export const createFieldsDefApi = (ctx: DContext, currencies: string[]) => {
	const fieldsDefApi: FormInputDef<LossesFields>[] = [
		...createFieldsDef(ctx, currencies),
		{ key: "apiImportId", label: "", type: "other" },
	];
	return fieldsDefApi;
};

// export const fieldsDefApi: FormInputDef<LossesFields>[] = [
// 	...fieldsDef,
// 	{ key: "apiImportId", label: "", type: "other" },
// ];
export async function fieldsDefView(
	ctx: DContext,
	currencies: string[],
): Promise<FormInputDef<LossesFields>[]> {
	return createFieldsDef(ctx, currencies);
}

// export const fieldsDefView: FormInputDef<LossesFields>[] = [...fieldsDef];

export function validate(fields: Partial<LossesFields>): Errors<LossesFields> {
	let errors: Errors<LossesFields> = { fields: {} };
	let msg = "must be >= 0";
	let check = (k: keyof LossesFields) => {
		if (fields[k] != null && (fields[k] as number) < 0)
			errors.fields![k] = [msg];
	};
	[
		"publicUnits",
		"publicCostUnit",
		"publicCostTotal",
		"privateUnits",
		"privateCostUnit",
		"privateCostTotal",
	].forEach((k) => check(k as keyof LossesFields));

	return errors;
}

export async function lossesCreate(
	_ctx: BackendContext,
	tx: Tx,
	fields: LossesFields,
): Promise<CreateResult<LossesFields>> {
	let errors = validate(fields);
	if (hasErrors(errors)) return { ok: false, errors };

	if (fields.sectorIsAgriculture) {
		fields.relatedToNotAgriculture = null;
	} else {
		fields.relatedToAgriculture = null;
	}

	const spatialFootprintValue = (fields as any).spatialFootprint;
	const { spatialFootprint: _ignoredSpatialFootprint, ...insertValues } =
		fields as any;

	const res = await tx
		.insert(lossesTable)
		.values({ ...insertValues })
		.returning({ id: lossesTable.id });

	await syncLossesSpatialFootprint(tx, res[0].id, spatialFootprintValue);
	return { ok: true, id: res[0].id };
}

export async function lossesUpdate(
	_ctx: BackendContext,
	tx: Tx,
	id: string,
	fields: Partial<LossesFields>,
): Promise<UpdateResult<LossesFields>> {
	let errors = validate(fields);
	if (hasErrors(errors)) return { ok: false, errors };

	if (typeof fields.sectorIsAgriculture == "boolean") {
		if (fields.sectorIsAgriculture) {
			fields.relatedToNotAgriculture = null;
		} else {
			fields.relatedToAgriculture = null;
		}
	}

	const spatialFootprintValue = (fields as any).spatialFootprint;
	const { spatialFootprint: _ignoredSpatialFootprint, ...updateValues } =
		fields as any;

	await tx
		.update(lossesTable)
		.set({ ...updateValues })
		.where(eq(lossesTable.id, id));

	if ("spatialFootprint" in fields) {
		await syncLossesSpatialFootprint(tx, id, spatialFootprintValue);
	}
	return { ok: true };
}

export async function lossesUpdateByIdAndCountryAccountsId(
	_ctx: BackendContext,
	tx: Tx,
	id: string,
	countryAccountsId: string,
	fields: Partial<LossesFields>,
): Promise<UpdateResult<LossesFields>> {
	let errors = validate(fields);
	if (hasErrors(errors)) return { ok: false, errors };

	let recordId = await getRecordId(tx, id);

	const disasterRecords =
		await DisasterRecordsRepository.getByIdAndCountryAccountsId(
			recordId,
			countryAccountsId,
		);
	if (!disasterRecords || disasterRecords.length === 0) {
		return {
			ok: false,
			errors: {
				general: ["No matching disaster record found or you don't have access"],
			},
		};
	}

	if (typeof fields.sectorIsAgriculture == "boolean") {
		if (fields.sectorIsAgriculture) {
			fields.relatedToNotAgriculture = null;
		} else {
			fields.relatedToAgriculture = null;
		}
	}

	const spatialFootprintValue = (fields as any).spatialFootprint;
	const { spatialFootprint: _ignoredSpatialFootprint, ...updateValues } =
		fields as any;

	await tx
		.update(lossesTable)
		.set({ ...updateValues })
		.where(eq(lossesTable.id, id));

	if ("spatialFootprint" in fields) {
		await syncLossesSpatialFootprint(tx, id, spatialFootprintValue);
	}
	return { ok: true };
}

async function getRecordId(tx: Tx, id: string) {
	let rows = await tx
		.select({
			recordId: lossesTable.recordId,
		})
		.from(lossesTable)
		.where(eq(lossesTable.id, id))
		.execute();
	if (!rows.length) throw new Error("not found by id");
	return rows[0].recordId;
}

export type LossesViewModel = Exclude<
	Awaited<ReturnType<typeof lossesById>>,
	undefined | null
>;

export async function lossesIdByImportId(tx: Tx, importId: string) {
	const res = await tx
		.select({ id: lossesTable.id })
		.from(lossesTable)
		.where(eq(lossesTable.apiImportId, importId));
	return res.length == 0 ? null : String(res[0].id);
}
// BUG: join on sectorId looks wrong — should probably be recordId to link through the disaster record for tenant scoping
export async function lossesIdByImportIdAndCountryAccountsId(
	tx: Tx,
	importId: string,
	countryAccountsId: string,
) {
	const res = await tx
		.select({ id: lossesTable.id })
		.from(lossesTable)
		.innerJoin(
			disasterRecordsTable,
			eq(lossesTable.sectorId, disasterRecordsTable.id),
		)
		.where(
			and(
				eq(lossesTable.apiImportId, importId),
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
			),
		);
	return res.length == 0 ? null : String(res[0].id);
}

export async function lossesById(ctx: BackendContext, idStr: string) {
	return lossesByIdTx(ctx, dr, idStr);
}

export async function lossesByIdTx(_ctx: BackendContext, tx: Tx, id: string) {
	let res = await tx.query.lossesTable.findFirst({
		where: eq(lossesTable.id, id),
	});
	if (!res) return null;

	const spatialFootprint = await loadLossesSpatialFootprint(tx, id);
	return {
		...res,
		spatialFootprint,
	};
}

export async function lossesByIdAndCountryAccountsId(
	ctx: BackendContext,
	id: string,
	countryAccountsId: string,
) {
	return lossesByIdAndCountryAccountsIdTx(ctx, dr, id, countryAccountsId);
}

export async function lossesByIdAndCountryAccountsIdTx(
	_ctx: BackendContext,
	tx: Tx,
	id: string,
	countryAccountsId: string,
) {
	let res = await tx.query.lossesTable.findFirst({
		where: eq(lossesTable.id, id),
		with: {
			disasterRecord: {
				columns: { countryAccountsId: true },
			},
		},
	});
	if (!res) return null;
	if (res.disasterRecord.countryAccountsId !== countryAccountsId) return null;

	const spatialFootprint = await loadLossesSpatialFootprint(tx, id);
	return {
		...res,
		spatialFootprint,
	};
}

export async function lossesDeleteById(
	id: string,
	countryAccountsId: string,
): Promise<DeleteResult> {
	const record = await dr
		.select({ recordId: lossesTable.recordId })
		.from(lossesTable)
		.innerJoin(
			disasterRecordsTable,
			eq(lossesTable.recordId, disasterRecordsTable.id),
		)
		.where(
			and(
				eq(lossesTable.id, id),
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

	await dr.delete(lossesTable).where(eq(lossesTable.id, id));

	return { ok: true };
}

export async function lossesDeleteBySectorId(
	id: string,
): Promise<DeleteResult> {
	await dr.delete(lossesTable).where(eq(lossesTable.sectorId, id));

	return { ok: true };
}
