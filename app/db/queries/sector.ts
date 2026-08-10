import { AnyColumn, sql, eq } from "drizzle-orm";
import { BackendContext } from "~/backend.server/context";
import { dr } from "~/db.server";
import { sectorTable } from "~/drizzle/schema/sectorTable";

export function sectorTreeDisplayNameSql(sectorIdColumn: AnyColumn, lang: string) {
	return sql<string>`(
		WITH RECURSIVE ParentCTE AS (
			SELECT
				s.id,
				dts_jsonb_localized(s.name, ${lang}) AS name,
				s.parent_id,
				dts_jsonb_localized(s.name, ${lang}) AS full_path
			FROM sector s
			WHERE s.id = ${sectorIdColumn}

			UNION ALL

			SELECT
				parent.id,
				dts_jsonb_localized(parent.name, ${lang}) AS name,
				parent.parent_id,
				dts_jsonb_localized(parent.name, ${lang}) || ' > ' || p.full_path AS full_path
			FROM sector parent
			INNER JOIN ParentCTE p ON parent.id = p.parent_id
		)
		SELECT full_path
		FROM ParentCTE
		WHERE parent_id IS NULL
	)`;
}

export interface Sector {
	id: string;
	name: string;
}

export function sectorSelect(ctx: BackendContext) {
	return dr
		.select({
			id: sectorTable.id,
			name: sql<string>`dts_jsonb_localized(${sectorTable.name}, ${ctx.lang})`.as(
				"name",
			),
			description:
				sql<string>`dts_jsonb_localized(${sectorTable.description}, ${ctx.lang})`.as(
					"description",
				),
		})
		.from(sectorTable);
}

export async function getSectorByLevel(
	ctx: BackendContext,
	level: number,
): Promise<Sector[]> {
	const rows = await sectorSelect(ctx)
		.where(eq(sectorTable.level, level))
		.orderBy(sql`name`);
	return rows;
}

export async function getSubSectorsBySectorId(
	ctx: BackendContext,
	sectorId: string,
): Promise<Sector[]> {
	const rows = await sectorSelect(ctx)
		.where(eq(sectorTable.parentId, sectorId))
		.orderBy(sql`name`);
	return rows;
}
