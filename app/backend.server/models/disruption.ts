import { dr, Tx } from "~/db.server";
import { disasterRecordsTable } from "~/drizzle/schema/disasterRecordsTable";
import { disruptionGeomTable } from "~/drizzle/schema/disruptionGeomTable";
import {
	disruptionTable,
	InsertDisruption,
} from "~/drizzle/schema/disruptionTable";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { DisruptionGeomRepository } from "~/db/queries/disruptionGeomRepository";
import { DisruptionDivisionRepository } from "~/db/queries/disruptionDivisionRepository";
import { and, eq, inArray, sql } from "drizzle-orm";

import {
	CreateResult,
	DeleteResult,
	UpdateResult,
} from "~/backend.server/handlers/form/form";
import { Errors, FormInputDef, hasErrors } from "~/frontend/form";
import { updateTotalsUsingDisasterRecordId } from "./analytics/disaster-events-cost-calculator";
import { DisasterRecordsRepository } from "~/db/queries/disasterRecordsRepository";
import { BackendContext } from "../context";
import { DContext } from "~/utils/dcontext";
export interface DisruptionFields extends Omit<InsertDisruption, "id"> {
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

async function syncDisruptionSpatialFootprint(
	tx: Tx,
	disruptionId: string,
	spatialFootprintValue: unknown,
) {
	const items = parseSpatialFootprintItems(spatialFootprintValue);
	const mapCoordinateItems = items.filter(
		(item) => item.map_option === "Map coordinates",
	);
	const geographicItems = items.filter(
		(item) => item.map_option === "Geographic level",
	);

	await DisruptionGeomRepository.deleteByDisruptionId(disruptionId, tx);
	await DisruptionDivisionRepository.deleteByDisruptionId(disruptionId, tx);

	if (mapCoordinateItems.length > 0) {
		await DisruptionGeomRepository.createMany(
			mapCoordinateItems
				.map((item) => {
					const geometry = extractGeojsonGeometry(item);
					if (!geometry) {
						return null;
					}

					return {
						disruptionId,
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
					disruptionId,
					divisionId,
				}));

			if (rows.length > 0) {
				await DisruptionDivisionRepository.createMany(rows, tx);
			}
		}
	}
}

async function loadDisruptionSpatialFootprint(tx: Tx, disruptionId: string) {
	const [geomRows, divisionRows] = await Promise.all([
		tx
			.select({
				id: disruptionGeomTable.id,
				title: disruptionGeomTable.title,
				geom: sql<string>`ST_AsGeoJSON(${disruptionGeomTable.geom})`,
			})
			.from(disruptionGeomTable)
			.where(eq(disruptionGeomTable.disruptionId, disruptionId)),
		DisruptionDivisionRepository.getByDisruptionId(disruptionId, tx),
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

export function getFieldsDef(
	ctx: DContext,
	currencies?: string[],
): FormInputDef<DisruptionFields>[] {
	if (!currencies) {
		currencies = [];
	}
	return [
		{ key: "recordId", label: "", type: "uuid" },
		{ key: "sectorId", label: "", type: "other" },
		{
			key: "durationDays",
			label: ctx.t({
				code: "disaster_records.disruption.duration_days",
				msg: "Duration (days)",
			}),
			type: "number",
			uiRow: {},
		},

		{
			key: "durationHours",
			label: ctx.t({
				code: "disaster_records.disruption.duration_hours",
				msg: "Duration (hours)",
			}),
			type: "number",
		},
		{
			key: "usersAffected",
			label: ctx.t({
				code: "disaster_records.disruption.number_of_users_affected",
				msg: "Number of users affected",
			}),
			type: "number",
		},
		{
			key: "peopleAffected",
			label: ctx.t({
				code: "disaster_records.disruption.number_of_people_affected",
				msg: "Number of people affected",
			}),
			type: "number",
		},
		{
			key: "comment",
			label: ctx.t({
				code: "disaster_records.disruption.add_comments",
				msg: "Add comments",
			}),
			type: "textarea",
			uiRowNew: true,
		},
		{
			key: "responseOperation",
			label: ctx.t({
				code: "disaster_records.disruption.response_operation",
				msg: "Response operation",
			}),
			type: "textarea",
		},
		{
			key: "responseCost",
			label: ctx.t({
				code: "disaster_records.disruption.response_cost",
				msg: "Response cost",
			}),
			type: "money",
			uiRow: {},
		},
		{
			key: "responseCurrency",
			label: ctx.t({
				code: "disaster_records.disruption.currency",
				msg: "Currency",
			}),
			type: "enum-flex",
			enumData: currencies.map((c) => {
				return { key: c, label: c };
			}),
		},
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
			label: ctx.t({
				code: "common.attachments",
				msg: "Attachments",
			}),
			type: "other",
			psqlType: "jsonb",
			uiRowNew: true,
		},
	];
}

export function getFieldsDefApi(
	ctx: DContext,
): FormInputDef<DisruptionFields>[] {
	const baseFields = getFieldsDef(ctx);
	return [...baseFields, { key: "apiImportId", label: "", type: "other" }];
}

export async function getFieldsDefView(
	ctx: DContext,
): Promise<FormInputDef<DisruptionFields>[]> {
	const baseFields = getFieldsDef(ctx);
	return [...baseFields];
}

export function validate(
	ctx: BackendContext,
	fields: Partial<DisruptionFields>,
): Errors<DisruptionFields> {
	let errors: Errors<DisruptionFields> = {};
	errors.fields = {};

	let check = (k: keyof DisruptionFields, msg: string) => {
		if (fields[k] != null && (fields[k] as number) < 0) {
			errors.fields![k] = [msg];
		}
	};

	check(
		"durationDays",
		ctx.t({
			code: "disaster_records.disruption.duration_days_must_be_gte_zero",
			msg: "Duration (days) must be >= 0",
		}),
	);
	check(
		"durationHours",
		ctx.t({
			code: "disaster_records.disruption.duration_hours_must_be_gte_zero",
			msg: "Duration (hours) must be >= 0",
		}),
	);
	check(
		"usersAffected",
		ctx.t({
			code: "disaster_records.disruption.users_affected_must_be_gte_zero",
			msg: "Users affected must be >= 0",
		}),
	);
	check(
		"responseCost",
		ctx.t({
			code: "disaster_records.disruption.response_cost_must_be_gte_zero",
			msg: "Response cost must be >= 0",
		}),
	);

	return errors;
}

export async function disruptionCreate(
	ctx: BackendContext,
	tx: Tx,
	fields: DisruptionFields,
): Promise<CreateResult<DisruptionFields>> {
	let errors = validate(ctx, fields);
	if (hasErrors(errors)) {
		return { ok: false, errors };
	}

	const spatialFootprintValue = (fields as any).spatialFootprint;
	const { spatialFootprint: _ignoredSpatialFootprint, ...insertValues } =
		fields as any;

	const res = await tx
		.insert(disruptionTable)
		.values({
			...insertValues,
		})
		.returning({ id: disruptionTable.id });

	await syncDisruptionSpatialFootprint(tx, res[0].id, spatialFootprintValue);

	await updateTotalsUsingDisasterRecordId(tx, fields.recordId);

	return { ok: true, id: res[0].id };
}

export async function disruptionUpdate(
	ctx: BackendContext,
	tx: Tx,
	id: string,
	fields: Partial<DisruptionFields>,
): Promise<UpdateResult<DisruptionFields>> {
	let errors = validate(ctx, fields);
	if (hasErrors(errors)) {
		return { ok: false, errors };
	}
	const spatialFootprintValue = (fields as any).spatialFootprint;
	const { spatialFootprint: _ignoredSpatialFootprint, ...updateValues } =
		fields as any;
	await tx
		.update(disruptionTable)
		.set({
			...updateValues,
		})
		.where(eq(disruptionTable.id, id));

	if ("spatialFootprint" in fields) {
		await syncDisruptionSpatialFootprint(tx, id, spatialFootprintValue);
	}

	let recordId = await getRecordId(tx, id);
	await updateTotalsUsingDisasterRecordId(tx, recordId);

	return { ok: true };
}

export async function disruptionUpdateByIdAndCountryAccountsId(
	ctx: BackendContext,
	tx: Tx,
	id: string,
	countryAccountsId: string,
	fields: Partial<DisruptionFields>,
): Promise<UpdateResult<DisruptionFields>> {
	let errors = validate(ctx, fields);
	if (hasErrors(errors)) {
		return { ok: false, errors };
	}

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
		.update(disruptionTable)
		.set({
			...updateValues,
		})
		.where(and(eq(disruptionTable.id, id)));

	if ("spatialFootprint" in fields) {
		await syncDisruptionSpatialFootprint(tx, id, spatialFootprintValue);
	}

	await updateTotalsUsingDisasterRecordId(tx, recordId);

	return { ok: true };
}

export async function getRecordId(tx: Tx, id: string) {
	let rows = await tx
		.select({
			recordId: disruptionTable.recordId,
		})
		.from(disruptionTable)
		.where(eq(disruptionTable.id, id))
		.execute();
	if (!rows.length) throw new Error("not found by id");
	return rows[0].recordId;
}

export type DisruptionViewModel = Exclude<
	Awaited<ReturnType<typeof disruptionById>>,
	undefined | null
>;

export async function disruptionIdByImportId(tx: Tx, importId: string) {
	const res = await tx
		.select({
			id: disruptionTable.id,
		})
		.from(disruptionTable)
		.where(eq(disruptionTable.apiImportId, importId));
	if (res.length == 0) {
		return null;
	}
	return String(res[0].id);
}
export async function disruptionIdByImportIdAndCountryAccountsId(
	tx: Tx,
	importId: string,
	countryAccountsId: string,
) {
	const res = await tx
		.select({
			id: disruptionTable.id,
		})
		.from(disruptionTable)
		.innerJoin(
			disasterRecordsTable,
			eq(disruptionTable.sectorId, disasterRecordsTable.id),
		)
		.where(
			and(
				eq(disruptionTable.apiImportId, importId),
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
			),
		);
	if (res.length == 0) {
		return null;
	}
	return String(res[0].id);
}

export async function disruptionById(ctx: BackendContext, idStr: string) {
	return disruptionByIdTx(ctx, dr, idStr);
}

export async function disruptionByIdTx(
	_ctx: BackendContext,
	tx: Tx,
	id: string,
) {
	let res = await tx.query.disruptionTable.findFirst({
		where: eq(disruptionTable.id, id),
	});
	if (!res) {
		return null;
	}

	const spatialFootprint = await loadDisruptionSpatialFootprint(tx, id);
	return {
		...res,
		spatialFootprint,
	};
}

export async function disruptionByIdAndCountryAccountsId(
	ctx: BackendContext,
	id: string,
	countryAccountsId: string,
) {
	return disruptionByIdAndCountryAccountsIdTx(ctx, dr, id, countryAccountsId);
}

export async function disruptionByIdAndCountryAccountsIdTx(
	_ctx: BackendContext,
	tx: Tx,
	id: string,
	countryAccountsId: string,
) {
	let res = await tx.query.disruptionTable.findFirst({
		where: eq(disruptionTable.id, id),
		with: {
			disasterRecord: {
				columns: { countryAccountsId: true },
			},
		},
	});
	if (!res) return null;
	if (res.disasterRecord.countryAccountsId !== countryAccountsId) return null;

	const spatialFootprint = await loadDisruptionSpatialFootprint(tx, id);
	return {
		...res,
		spatialFootprint,
	};
}

export async function disruptionDeleteById(
	id: string,
	countryAccountsId: string,
): Promise<DeleteResult> {
	const record = await dr
		.select({ recordId: disruptionTable.recordId })
		.from(disruptionTable)
		.innerJoin(
			disasterRecordsTable,
			eq(disruptionTable.recordId, disasterRecordsTable.id),
		)
		.where(
			and(
				eq(disruptionTable.id, id),
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

	await dr.delete(disruptionTable).where(eq(disruptionTable.id, id));

	return { ok: true };
}

export async function disruptionDeleteBySectorId(
	id: string,
): Promise<DeleteResult> {
	await dr.delete(disruptionTable).where(eq(disruptionTable.sectorId, id));

	return { ok: true };
}
