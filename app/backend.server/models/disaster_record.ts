import { dr, Tx } from "~/db.server";
import { sectorDisasterRecordsRelationTable } from "~/drizzle/schema/sectorDisasterRecordsRelationTable";
import { nonecoLossesTable } from "~/drizzle/schema/nonecoLossesTable";
import { disasterRecordsTable } from "~/drizzle/schema/disasterRecordsTable";
import { SelectDisasterRecords } from "~/drizzle/schema/disasterRecordsTable";
import { disasterRecordsGeomTable } from "~/drizzle/schema/disasterRecordsGeomTable";
import { lossesTable } from "~/drizzle/schema/lossesTable";
import { damagesTable } from "~/drizzle/schema/damagesTable";
import { disruptionTable } from "~/drizzle/schema/disruptionTable";
import { humanCategoryPresenceTable } from "~/drizzle/schema/humanCategoryPresenceTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { DisasterRecordsGeomRepository } from "~/db/queries/disasterRecordsGeomRepository";
import { DisasterRecordsDivisionRepository } from "~/db/queries/disasterRecordsDivisionRepository";
import { eq, sql, and, inArray } from "drizzle-orm";

import {
	CreateResult,
	DeleteResult,
	UpdateResult,
} from "~/backend.server/handlers/form/form";
import { Errors, hasErrors } from "~/frontend/form";
import { updateTotalsUsingDisasterRecordId } from "./analytics/disaster-events-cost-calculator";
import {
	getHazardById,
	getClusterById,
	getTypeById,
} from "~/backend.server/models/hip";
import { deleteAllData as deleteAllDataHumanEffects } from "~/backend.server/handlers/human_effects";
import { BackendContext } from "../context";
import { approvalStatusIds } from "~/frontend/approval";

export interface DisasterRecordsFields extends Omit<
	SelectDisasterRecords,
	"id"
> {
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

async function syncDisasterRecordSpatialFootprint(
	tx: Tx,
	disasterRecordId: string,
	spatialFootprintValue: unknown,
) {
	const items = parseSpatialFootprintItems(spatialFootprintValue);
	const mapCoordinateItems = items.filter(
		(item) => item.map_option === "Map coordinates",
	);
	const geographicItems = items.filter(
		(item) => item.map_option === "Geographic level",
	);

	await DisasterRecordsGeomRepository.deleteByDisasterRecordId(
		disasterRecordId,
		tx,
	);
	await DisasterRecordsDivisionRepository.deleteByDisasterRecordId(
		disasterRecordId,
		tx,
	);

	if (mapCoordinateItems.length > 0) {
		await DisasterRecordsGeomRepository.createMany(
			mapCoordinateItems
				.map((item) => {
					const geometry = extractGeojsonGeometry(item);
					if (!geometry) {
						return null;
					}

					return {
						disasterRecordId,
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
					disasterRecordId,
					divisionId,
				}));

			if (rows.length > 0) {
				await DisasterRecordsDivisionRepository.createMany(rows, tx);
			}
		}
	}
}

async function loadDisasterRecordSpatialFootprint(
	tx: Tx,
	disasterRecordId: string,
) {
	const [geomRows, divisionRows] = await Promise.all([
		tx
			.select({
				id: disasterRecordsGeomTable.id,
				title: disasterRecordsGeomTable.title,
				geom: sql<string>`ST_AsGeoJSON(${disasterRecordsGeomTable.geom})`,
			})
			.from(disasterRecordsGeomTable)
			.where(eq(disasterRecordsGeomTable.disasterRecordId, disasterRecordId)),
		DisasterRecordsDivisionRepository.getByDisasterRecordId(
			disasterRecordId,
			tx,
		),
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

// do not change
export function validate(
	fields: Partial<DisasterRecordsFields>,
): Errors<DisasterRecordsFields> {
	let errors: Errors<DisasterRecordsFields> = {};
	errors.fields = {};

	// Validation start/end date: when updating date, all two fields must be available in the partial
	if (fields.startDate || fields.endDate) {
		if (!("startDate" in fields))
			errors.fields.startDate = [
				"Field is required. Otherwise set the value to null.",
			];
		if (!("endDate" in fields))
			errors.fields.endDate = [
				"Field is required. Otherwise set the value to null.",
			];
		if (fields.startDate && fields.endDate && fields.startDate > fields.endDate)
			errors.fields.startDate = ["Field start must be before end."];
	}

	// Validation HIPs: when updating HIPs, all three fields must be available in the partial
	if (fields.hipTypeId || fields.hipClusterId || fields.hipHazardId) {
		if (!fields.hipTypeId || !fields.hipClusterId || !fields.hipHazardId) {
			if (!("hipTypeId" in fields)) {
				errors.fields.hipTypeId = [
					`Field hipTypeId is required when updating any HIPs info. Otherwise set the value to null.`,
				];
			}
			if (!("hipClusterId" in fields)) {
				errors.fields.hipClusterId = [
					`Field hipClusterId is required when updating any HIPs info. Otherwise set the value to null.`,
				];
			}
			if (!("hipHazardId" in fields)) {
				errors.fields.hipHazardId = [
					`Field hipHazardId is required when updating any HIPs info. Otherwise set the value to null.`,
				];
			}
		}
	}

	return errors;
}

export async function disasterRecordsCreate(
	ctx: BackendContext,
	tx: Tx,
	fields: DisasterRecordsFields,
): Promise<CreateResult<DisasterRecordsFields>> {
	let errors = validate(fields);
	if (hasErrors(errors)) {
		return { ok: false, errors };
	}

	// When updating HIPs, all three fields must be available in the partial
	if (fields.hipTypeId || fields.hipClusterId || fields.hipHazardId) {
		if (fields.hipHazardId) {
			const hipRecord = await getHazardById(ctx, fields.hipHazardId);
			if (!hipRecord && errors.fields) {
				errors.fields.hipHazardId = [`Invalid value ${fields.hipHazardId}.`];
			}
			if (
				hipRecord &&
				errors.fields &&
				fields.hipClusterId != hipRecord.clusterId
			) {
				errors.fields.hipClusterId = [`Invalid value ${fields.hipClusterId}.`];
			}
			if (hipRecord && errors.fields && fields.hipTypeId != hipRecord.typeId) {
				errors.fields.hipTypeId = [`Invalid value ${fields.hipTypeId}.`];
			}
		} else if (fields.hipClusterId) {
			const hipRecord = await getClusterById(ctx, fields.hipClusterId);
			if (!hipRecord && errors.fields) {
				errors.fields.hipClusterId = [`Invalid value ${fields.hipClusterId}.`];
			}
			if (hipRecord && errors.fields && fields.hipTypeId != hipRecord.typeId) {
				errors.fields.hipTypeId = [`Invalid value ${fields.hipTypeId}.`];
			}
		} else if (fields.hipTypeId) {
			const hipRecord = await getTypeById(ctx, fields.hipTypeId);
			if (!hipRecord && errors.fields) {
				errors.fields.hipTypeId = [`Invalid value ${fields.hipTypeId}.`];
			}
			if (hipRecord && errors.fields && fields.hipTypeId != hipRecord.id) {
				errors.fields.hipTypeId = [`Invalid value ${fields.hipTypeId}.`];
			}
		}
	}
	if (hasErrors(errors)) {
		return { ok: false, errors };
	}

	if (!fields.countryAccountsId) {
		return {
			ok: false,
			errors: {
				fields: {},
				form: ["Missing country account id"],
			},
		};
	}

	// Enforce tenant isolation for disaster event references
	if (fields.disasterEventId) {
		// Check if the referenced disaster event belongs to the same tenant
		const disasterEventCheck = await tx.query.disasterEventTable.findFirst({
			where: and(
				eq(disasterEventTable.id, fields.disasterEventId),
				eq(disasterEventTable.countryAccountsId, fields.countryAccountsId),
			),
		});

		if (!disasterEventCheck) {
			return {
				ok: false,
				errors: {
					fields: {},
					form: [
						"Cannot create disaster record with disaster event from other country instances of DELTA",
					],
				},
			};
		}
	}

	const spatialFootprintValue = (fields as any).spatialFootprint;
	const { spatialFootprint: _ignoredSpatialFootprint, ...insertValues } =
		fields as any;

	const res = await tx
		.insert(disasterRecordsTable)
		.values({
			...insertValues,
			updatedAt: sql`NOW()`,
		})
		.returning({ id: disasterRecordsTable.id });

	await syncDisasterRecordSpatialFootprint(
		tx,
		res[0].id,
		spatialFootprintValue,
	);

	return { ok: true, id: res[0].id };
}

export async function disasterRecordsUpdate(
	ctx: BackendContext,
	tx: Tx,
	idStr: string,
	fields: Partial<DisasterRecordsFields>,
	countryAccountsId: string,
): Promise<UpdateResult<DisasterRecordsFields>> {
	let errors = validate(fields);
	if (hasErrors(errors)) {
		return { ok: false, errors };
	}

	// When updating HIPs, all three fields must be available in the partial
	if (fields.hipTypeId || fields.hipClusterId || fields.hipHazardId) {
		if (fields.hipHazardId) {
			const hipRecord = await getHazardById(ctx, fields.hipHazardId);
			if (!hipRecord && errors.fields) {
				errors.fields.hipHazardId = [`Invalid value ${fields.hipHazardId}.`];
			}
			if (
				hipRecord &&
				errors.fields &&
				fields.hipClusterId != hipRecord.clusterId
			) {
				errors.fields.hipClusterId = [`Invalid value ${fields.hipClusterId}.`];
			}
			if (hipRecord && errors.fields && fields.hipTypeId != hipRecord.typeId) {
				errors.fields.hipTypeId = [`Invalid value ${fields.hipTypeId}.`];
			}
		} else if (fields.hipClusterId) {
			const hipRecord = await getClusterById(ctx, fields.hipClusterId);
			if (!hipRecord && errors.fields) {
				errors.fields.hipClusterId = [`Invalid value ${fields.hipClusterId}.`];
			}
			if (hipRecord && errors.fields && fields.hipTypeId != hipRecord.typeId) {
				errors.fields.hipTypeId = [`Invalid value ${fields.hipTypeId}.`];
			}
		} else if (fields.hipTypeId) {
			const hipRecord = await getTypeById(ctx, fields.hipTypeId);
			if (!hipRecord && errors.fields) {
				errors.fields.hipTypeId = [`Invalid value ${fields.hipTypeId}.`];
			}
			if (hipRecord && errors.fields && fields.hipTypeId != hipRecord.id) {
				errors.fields.hipTypeId = [`Invalid value ${fields.hipTypeId}.`];
			}
		}
	}
	if (hasErrors(errors)) {
		return { ok: false, errors };
	}

	// First check if the record exists and belongs to the tenant
	const existingRecord = await tx
		.select()
		.from(disasterRecordsTable)
		.where(
			and(
				eq(disasterRecordsTable.id, idStr),
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
			),
		)
		.limit(1);

	if (existingRecord.length === 0) {
		return {
			ok: false,
			errors: {
				fields: {},
				form: ["Record not found or you don't have permission to update it"],
			},
		};
	}

	// Enforce tenant isolation for disaster event references
	if (fields.disasterEventId && fields.disasterEventId !== "") {
		// Check if the referenced disaster event belongs to the same tenant
		const disasterEventCheck = await tx.query.disasterEventTable.findFirst({
			where: and(
				eq(disasterEventTable.id, fields.disasterEventId),
				eq(disasterEventTable.countryAccountsId, countryAccountsId),
			),
		});

		if (!disasterEventCheck) {
			return {
				ok: false,
				errors: {
					fields: {},
					form: [
						"Cannot update disaster record with disaster event from other country instances of DELTA",
					],
				},
			};
		}
	}

	if (fields.disasterEventId === "") {
		fields.disasterEventId = null;
	}

	let id = idStr;
	const spatialFootprintValue = (fields as any).spatialFootprint;
	const { spatialFootprint: _ignoredSpatialFootprint, ...updateValues } =
		fields as any;
	await tx
		.update(disasterRecordsTable)
		.set({
			...updateValues,
			updatedAt: sql`NOW()`,
		})
		.where(
			and(
				eq(disasterRecordsTable.id, id),
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
			),
		);

	await syncDisasterRecordSpatialFootprint(tx, id, spatialFootprintValue);

	await updateTotalsUsingDisasterRecordId(tx, idStr);

	return { ok: true };
}

export async function disasterRecordsUpdateApprovalStatus(
	id: string,
	status: approvalStatusIds,
): Promise<UpdateResult<DisasterRecordsFields>> {
	const updated = await dr
		.update(disasterRecordsTable)
		.set({ approvalStatus: status, updatedAt: sql`NOW()` })
		.where(eq(disasterRecordsTable.id, id))
		.returning({ id: disasterRecordsTable.id });

	if (updated.length === 0) {
		return {
			ok: false,
			errors: {
				fields: {},
				form: ["not-found"],
			},
		};
	}

	return { ok: true };
}

export async function disasterRecordsUpdateApprovalStatusOnGoing(
	id: string,
	status: "draft" | "waiting-for-validation" | "needs-revision",
): Promise<UpdateResult<DisasterRecordsFields>> {
	const updated = await dr
		.update(disasterRecordsTable)
		.set({
			approvalStatus: status,
			submittedByUserId: null,
			submittedAt: null,
			validatedByUserId: null,
			validatedAt: null,
			publishedByUserId: null,
			publishedAt: null,
			updatedAt: sql`NOW()`,
		})
		.where(eq(disasterRecordsTable.id, id))
		.returning({ id: disasterRecordsTable.id });

	if (updated.length === 0) {
		return {
			ok: false,
			errors: {
				fields: {},
				form: ["not-found"],
			},
		};
	}

	return { ok: true };
}

export async function disasterRecordsUpdateApprovalStatusNeedRevision(
	id: string,
): Promise<UpdateResult<DisasterRecordsFields>> {
	const updated = await dr
		.update(disasterRecordsTable)
		.set({
			approvalStatus: "needs-revision",
			validatedByUserId: null,
			validatedAt: null,
			publishedByUserId: null,
			publishedAt: null,
			updatedAt: sql`NOW()`,
		})
		.where(eq(disasterRecordsTable.id, id))
		.returning({ id: disasterRecordsTable.id });

	if (updated.length === 0) {
		return {
			ok: false,
			errors: {
				fields: {},
				form: ["not-found"],
			},
		};
	}

	return { ok: true };
}

export async function disasterRecordsUpdateApprovalStatusValidate(
	id: string,
	validatedByUserId: string,
): Promise<UpdateResult<DisasterRecordsFields>> {
	const updated = await dr
		.update(disasterRecordsTable)
		.set({
			approvalStatus: "validated",
			validatedByUserId,
			validatedAt: sql`NOW()`,
			publishedByUserId: null,
			publishedAt: null,
			updatedAt: sql`NOW()`,
		})
		.where(eq(disasterRecordsTable.id, id))
		.returning({ id: disasterRecordsTable.id });

	if (updated.length === 0) {
		return {
			ok: false,
			errors: {
				fields: {},
				form: ["not-found"],
			},
		};
	}

	return { ok: true };
}

export async function disasterRecordsUpdateApprovalStatusPublish(
	id: string,
	publishedByUserId: string,
): Promise<UpdateResult<DisasterRecordsFields>> {
	const updated = await dr
		.update(disasterRecordsTable)
		.set({
			approvalStatus: "published",
			validatedByUserId: publishedByUserId,
			validatedAt: sql`NOW()`,
			publishedByUserId,
			publishedAt: sql`NOW()`,
			updatedAt: sql`NOW()`,
		})
		.where(eq(disasterRecordsTable.id, id))
		.returning({ id: disasterRecordsTable.id });

	if (updated.length === 0) {
		return {
			ok: false,
			errors: {
				fields: {},
				form: ["not-found"],
			},
		};
	}

	return { ok: true };
}

export type DisasterRecordsViewModel = Exclude<
	Awaited<ReturnType<typeof disasterRecordsById>>,
	undefined
>;

export async function disasterRecordsIdByImportId(tx: Tx, importId: string) {
	const res = await tx
		.select({
			id: disasterRecordsTable.id,
		})
		.from(disasterRecordsTable)
		.where(eq(disasterRecordsTable.apiImportId, importId));
	if (res.length == 0) {
		return null;
	}
	return res[0].id;
}
export async function disasterRecordsIdByImportIdAndCountryAccountsId(
	tx: Tx,
	importId: string,
	countryAccountsId: string,
) {
	const res = await tx
		.select({
			id: disasterRecordsTable.id,
		})
		.from(disasterRecordsTable)
		.where(
			and(
				eq(disasterRecordsTable.apiImportId, importId),
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
			),
		);
	if (res.length == 0) {
		return null;
	}
	return res[0].id;
}

export async function disasterRecordsBasicInfoById(idStr: string) {
	// For public access, only fetch published records without tenant context
	let id = idStr;

	// Query just the disaster record with approval status check
	let record = await dr
		.select()
		.from(disasterRecordsTable)
		.where(
			and(
				eq(disasterRecordsTable.id, id),
				eq(disasterRecordsTable.approvalStatus, "published"), // Only published records are accessible
			),
		)
		.limit(1);

	if (record.length === 0) {
		return null; // Return null if not found or not published
	}

	return record[0];
}

export async function disasterRecordsById(
	idStr: string,
	countryAccountsId: string,
) {
	return disasterRecordsByIdTx(dr, idStr, countryAccountsId);
}

export async function disasterRecordsByIdTx(
	tx: Tx,
	idStr: string,
	countryAccountsId: string,
) {
	let id = idStr;

	let record = await tx
		.select()
		.from(disasterRecordsTable)
		.where(
			and(
				eq(disasterRecordsTable.id, id),
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
			),
		);

	if (record.length === 0) {
		return null;
	}

	const spatialFootprint = await loadDisasterRecordSpatialFootprint(tx, id);

	return {
		...record[0],
		spatialFootprint,
	};
}

export async function disasterRecordsDeleteById(
	idStr: string,
	countryAccountsId: string,
): Promise<DeleteResult> {
	// First verify the record belongs to the tenant
	const record = await disasterRecordsById(idStr, countryAccountsId);
	if (!record) {
		return {
			ok: false,
			error: "Record not found or you don't have permission to delete it",
		};
	}

	// Delete with tenant isolation
	await dr
		.delete(disasterRecordsTable)
		.where(
			and(
				eq(disasterRecordsTable.id, idStr),
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
			),
		);
	return { ok: true };
}

export async function getHumanEffectRecordsById(
	disasterRecordidStr: string,
	countryAccountsId: string,
) {
	return _getHumanEffectRecordsByIdTx(
		dr,
		disasterRecordidStr,
		countryAccountsId,
	);
}

async function _getHumanEffectRecordsByIdTx(
	tx: Tx,
	disasterRecordidStr: string,
	countryAccountsId: string,
) {
	// First verify the disaster record belongs to the tenant
	const record = await disasterRecordsByIdTx(
		tx,
		disasterRecordidStr,
		countryAccountsId,
	);
	if (!record) {
		throw new Error(
			"Record not found or you don't have permission to access it",
		);
	}
	let id = disasterRecordidStr;
	let res = await tx.query.humanCategoryPresenceTable.findFirst({
		where: eq(humanCategoryPresenceTable.recordId, id),
	});

	return res;
}

export async function deleteAllDataByDisasterRecordId(
	ctx: BackendContext,
	idStr: string,
	countryAccountsId: string,
): Promise<DeleteResult> {
	await dr.transaction(async (tx) => {
		const existingRecord = tx
			.select({})
			.from(disasterRecordsTable)
			.where(
				and(
					eq(disasterRecordsTable.id, idStr),
					eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				),
			);
		if (!existingRecord) {
			throw new Error(
				`Record with ID ${idStr} not found or you don't have permission to delete it.`,
			);
		}

		// -------------------------------------
		// DELETE child related noneco losses
		// -------------------------------------
		await tx
			.delete(nonecoLossesTable)
			.where(and(eq(nonecoLossesTable.disasterRecordId, idStr)));

		// -------------------------------------
		// DELETE child related sector effects relations
		// -------------------------------------
		// Delete child related damages
		await tx.delete(damagesTable).where(and(eq(damagesTable.recordId, idStr)));

		// Delete child related losses
		await tx.delete(lossesTable).where(and(eq(lossesTable.recordId, idStr)));

		// Delete child related disruptions
		await tx
			.delete(disruptionTable)
			.where(and(eq(disruptionTable.recordId, idStr)));

		// Delete child related sector relations
		await tx
			.delete(sectorDisasterRecordsRelationTable)
			.where(
				and(eq(sectorDisasterRecordsRelationTable.disasterRecordId, idStr)),
			);

		// -------------------------------------
		// DELETE child related human effects
		// -------------------------------------
		await deleteAllDataHumanEffects(ctx, idStr, countryAccountsId);

		// -------------------------------------
		// DELETE parent disaster record
		// -------------------------------------
		await tx
			.delete(disasterRecordsTable)
			.where(
				and(
					eq(disasterRecordsTable.id, idStr),
					eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				),
			);
	});

	return {
		ok: true,
	};
}
