import { and, eq, inArray, sql } from "drizzle-orm";
import { dr, Tx } from "../../db.server";
import { divisionTable, InsertDivision } from "~/drizzle/schema/divisionTable";
import { damagesDivisionTable } from "~/drizzle/schema/damagesDivisionTable";
import { lossesDivisionTable } from "~/drizzle/schema/lossesDivisionTable";
import { disruptionDivisionTable } from "~/drizzle/schema/disruptionDivisionTable";
import { disasterEventDivisionTable } from "~/drizzle/schema/disasterEventDivisionTable";
import { disasterRecordsDivisionTable } from "~/drizzle/schema/disasterRecordsDivisionTable";
import { hazardousEventDivisionTable } from "~/drizzle/schema/hazardousEventDivisionTable";
export const DivisionRepository = {
	deleteByCountryAccountId: (countryAccountsId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(divisionTable)
			.where(eq(divisionTable.countryAccountsId, countryAccountsId));
	},
	getByCountryAccountsId: (countryAccountsId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(divisionTable)
			.where(eq(divisionTable.countryAccountsId, countryAccountsId));
	},
	createMany: (data: InsertDivision[], tx?: Tx) => {
		return (tx ?? dr).insert(divisionTable).values(data).returning().execute();
	},
	getById: async (id: string, countryAccountsId: string, tx?: Tx) => {
		const rows = await (tx ?? dr)
			.select()
			.from(divisionTable)
			.where(
				and(
					eq(divisionTable.id, id),
					eq(divisionTable.countryAccountsId, countryAccountsId),
				),
			);
		return rows[0] ?? null;
	},
	getDescendantIds: async (
		rootDivisionId: string,
		countryAccountsId: string,
		tx?: Tx,
	) => {
		const rows = await DivisionRepository.getByCountryAccountsId(
			countryAccountsId,
			tx,
		);

		const childrenByParent = new Map<string, string[]>();
		for (const row of rows) {
			if (!row.parentId) {
				continue;
			}

			const current = childrenByParent.get(row.parentId) || [];
			current.push(row.id);
			childrenByParent.set(row.parentId, current);
		}

		const descendants: string[] = [];
		const queue = [...(childrenByParent.get(rootDivisionId) || [])];

		while (queue.length) {
			const childId = queue.shift();
			if (!childId) {
				continue;
			}

			descendants.push(childId);
			const nestedChildren = childrenByParent.get(childId) || [];
			for (const nestedChild of nestedChildren) {
				queue.push(nestedChild);
			}
		}

		return descendants;
	},
	deleteById: async (id: string, countryAccountsId: string, tx?: Tx) => {
		const deleted = await (tx ?? dr)
			.delete(divisionTable)
			.where(
				and(
					eq(divisionTable.id, id),
					eq(divisionTable.countryAccountsId, countryAccountsId),
				),
			)
			.returning({ id: divisionTable.id });
		return deleted.length > 0;
	},
	getInUseDivisionIds: async (divisionIds: string[], tx?: Tx) => {
		if (!divisionIds.length) {
			return new Set<string>();
		}

		const queryDb = tx ?? dr;
		const [damagesRows, lossesRows, disruptionRows, disasterEventRows, disasterRecordRows, hazardousEventRows] = await Promise.all([
			queryDb
				.select({ divisionId: damagesDivisionTable.divisionId })
				.from(damagesDivisionTable)
				.where(inArray(damagesDivisionTable.divisionId, divisionIds)),
			queryDb
				.select({ divisionId: lossesDivisionTable.divisionId })
				.from(lossesDivisionTable)
				.where(inArray(lossesDivisionTable.divisionId, divisionIds)),
			queryDb
				.select({ divisionId: disruptionDivisionTable.divisionId })
				.from(disruptionDivisionTable)
				.where(inArray(disruptionDivisionTable.divisionId, divisionIds)),
			queryDb
				.select({ divisionId: disasterEventDivisionTable.divisionId })
				.from(disasterEventDivisionTable)
				.where(inArray(disasterEventDivisionTable.divisionId, divisionIds)),
			queryDb
				.select({ divisionId: disasterRecordsDivisionTable.divisionId })
				.from(disasterRecordsDivisionTable)
				.where(inArray(disasterRecordsDivisionTable.divisionId, divisionIds)),
			queryDb
				.select({ divisionId: hazardousEventDivisionTable.divisionId })
				.from(hazardousEventDivisionTable)
				.where(inArray(hazardousEventDivisionTable.divisionId, divisionIds)),
		]);

		const ids = new Set<string>();
		for (const row of [
			...damagesRows,
			...lossesRows,
			...disruptionRows,
			...disasterEventRows,
			...disasterRecordRows,
			...hazardousEventRows,
		]) {
			if (row.divisionId) {
				ids.add(row.divisionId);
			}
		}

		return ids;
	},
	update: async (
		id: string,
		data: InsertDivision,
		countryAccountsId: string,
		tx?: Tx,
	): Promise<{ ok: boolean; errors?: string[] }> => {
		try {
			const updated = await (tx ?? dr)
				.update(divisionTable)
				.set(data)
				.where(
					and(
						eq(divisionTable.id, id),
						eq(divisionTable.countryAccountsId, countryAccountsId),
					),
				)
				.returning({ id: divisionTable.id });

			if (!updated.length) {
				return { ok: false, errors: ["Division not found or access denied"] };
			}

			return { ok: true };
		} catch {
			return { ok: false, errors: ["Failed to update the division"] };
		}
	},
	updateGeometryIfMissing: async (
		id: string,
		countryAccountsId: string,
		geojsonFeature: unknown,
		geometry: unknown,
		tx?: Tx,
	): Promise<{ ok: boolean; errors?: string[] }> => {
		try {
			const updated = await (tx ?? dr)
				.update(divisionTable)
				.set({
					geojson: geojsonFeature,
					geom: sql`ST_MakeValid(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}))`,
					bbox: sql`ST_Envelope(ST_MakeValid(ST_GeomFromGeoJSON(${JSON.stringify(geometry)})))`,
				})
				.where(
					and(
						eq(divisionTable.id, id),
						eq(divisionTable.countryAccountsId, countryAccountsId),
						sql`${divisionTable.geom} IS NULL`,
					),
				)
				.returning({ id: divisionTable.id });

			if (!updated.length) {
				return {
					ok: false,
					errors: [
						"Division geometry already exists, or division not found/access denied",
					],
				};
			}

			return { ok: true };
		} catch {
			return { ok: false, errors: ["Failed to update division geometry"] };
		}
	},
};
