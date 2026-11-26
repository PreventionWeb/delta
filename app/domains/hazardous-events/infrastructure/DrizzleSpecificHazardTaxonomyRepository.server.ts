import { Injectable, Inject } from "@nestjs/common";
import { asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Dr } from "~/db.server";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import { specificHazardTable } from "./specificHazardTable";
import { hazardClusterTable } from "./hazardClusterTable";
import { hazardTypeTable } from "./hazardTypeTable";
import { textContentTable } from "~/domains/shared/infrastructure/textContentTable";
import type {
	HazardTaxonomyOptions,
	ISpecificHazardTaxonomyRepository,
	SourceRefQuery,
	SourceRefResolution,
	SpecificHazardTaxonomyNames,
	TaxonomyAncestors,
} from "../application/ports/ISpecificHazardTaxonomyRepository";

interface SourceRefRow {
	kind: "hazard" | "specific" | "cluster" | "type";
	key: string;
	specific_hazard_id: string | null;
	hazard_cluster_id: string | null;
	hazard_type_id: string;
}

/** One array parameter per list, so a file with many refs never hits the bind-parameter limit. */
function textList(values: readonly string[]): SQL {
	return sql`${sql.param([...values])}::text[]`;
}

const specificHazardName = alias(textContentTable, "specific_hazard_name");
const hazardClusterName = alias(textContentTable, "hazard_cluster_name");
const hazardTypeName = alias(textContentTable, "hazard_type_name");

@Injectable()
export class DrizzleSpecificHazardTaxonomyRepository implements ISpecificHazardTaxonomyRepository {
	constructor(@Inject(DRIZZLE_CLIENT) private readonly db: Dr) {}

	async findNamesByIds(
		ids: readonly string[],
	): Promise<ReadonlyMap<string, SpecificHazardTaxonomyNames>> {
		if (ids.length === 0) return new Map();

		const rows = await this.db
			.select({
				id: specificHazardTable.id,
				specificHazardName: specificHazardName.originalText,
				hazardClusterName: hazardClusterName.originalText,
				hazardTypeName: hazardTypeName.originalText,
				specificHazardCode: specificHazardTable.code,
			})
			.from(specificHazardTable)
			.innerJoin(
				specificHazardName,
				eq(specificHazardName.id, specificHazardTable.nameTextContentId),
			)
			.innerJoin(
				hazardClusterTable,
				eq(hazardClusterTable.id, specificHazardTable.hazardClusterId),
			)
			.innerJoin(
				hazardClusterName,
				eq(hazardClusterName.id, hazardClusterTable.nameTextContentId),
			)
			.innerJoin(
				hazardTypeTable,
				eq(hazardTypeTable.id, hazardClusterTable.hazardTypeId),
			)
			.innerJoin(
				hazardTypeName,
				eq(hazardTypeName.id, hazardTypeTable.nameTextContentId),
			)
			.where(inArray(specificHazardTable.id, [...ids]));

		return new Map(rows.map(({ id, ...names }) => [id, names] as const));
	}

	async listAll(): Promise<HazardTaxonomyOptions> {
		const [types, clusters, specificHazards] = await Promise.all([
			this.db
				.select({
					id: hazardTypeTable.id,
					name: textContentTable.originalText,
				})
				.from(hazardTypeTable)
				.innerJoin(
					textContentTable,
					eq(textContentTable.id, hazardTypeTable.nameTextContentId),
				)
				.orderBy(asc(textContentTable.originalText)),
			this.db
				.select({
					id: hazardClusterTable.id,
					typeId: hazardClusterTable.hazardTypeId,
					name: textContentTable.originalText,
				})
				.from(hazardClusterTable)
				.innerJoin(
					textContentTable,
					eq(textContentTable.id, hazardClusterTable.nameTextContentId),
				)
				.orderBy(asc(textContentTable.originalText)),
			this.db
				.select({
					id: specificHazardTable.id,
					clusterId: specificHazardTable.hazardClusterId,
					code: specificHazardTable.code,
					name: textContentTable.originalText,
				})
				.from(specificHazardTable)
				.innerJoin(
					textContentTable,
					eq(textContentTable.id, specificHazardTable.nameTextContentId),
				)
				.orderBy(asc(textContentTable.originalText)),
		]);

		return { types, clusters, specificHazards };
	}

	async findAnySpecificHazardId(): Promise<string | null> {
		const [row] = await this.db
			.select({ id: specificHazardTable.id })
			.from(specificHazardTable)
			.orderBy(asc(specificHazardTable.code))
			.limit(1);
		return row?.id ?? null;
	}

	/** UNION ALL of one branch per non-empty ref list, so the whole lookup is one statement. */
	async findBySourceRefIds(refs: SourceRefQuery): Promise<SourceRefResolution> {
		const branches: SQL[] = [];
		const hazardChain = sql`FROM specific_hazard sh
			JOIN hazard_cluster hc ON hc.id = sh.hazard_cluster_id
			JOIN hazard_type ht ON ht.id = hc.hazard_type_id`;
		if (refs.hazardRefs.length > 0) {
			branches.push(sql`SELECT 'hazard' AS kind, sh.source_ref_id AS key, sh.id AS specific_hazard_id,
				hc.id AS hazard_cluster_id, ht.id AS hazard_type_id ${hazardChain}
				WHERE sh.source_ref_id = ANY(${textList(refs.hazardRefs)})`);
		}
		const specificHazardIds = refs.specificHazardIds ?? [];
		if (specificHazardIds.length > 0) {
			branches.push(sql`SELECT 'specific' AS kind, sh.id::text AS key, sh.id AS specific_hazard_id,
				hc.id AS hazard_cluster_id, ht.id AS hazard_type_id ${hazardChain}
				WHERE sh.id::text = ANY(${textList(specificHazardIds)})`);
		}
		if (refs.clusterRefs.length > 0) {
			branches.push(sql`SELECT 'cluster' AS kind, hc.source_ref_id AS key, NULL::uuid AS specific_hazard_id,
				hc.id AS hazard_cluster_id, hc.hazard_type_id AS hazard_type_id
				FROM hazard_cluster hc WHERE hc.source_ref_id = ANY(${textList(refs.clusterRefs)})`);
		}
		if (refs.typeRefs.length > 0) {
			branches.push(sql`SELECT 'type' AS kind, ht.source_ref_id AS key, NULL::uuid AS specific_hazard_id,
				NULL::uuid AS hazard_cluster_id, ht.id AS hazard_type_id
				FROM hazard_type ht WHERE ht.source_ref_id = ANY(${textList(refs.typeRefs)})`);
		}

		const hazards = new Map<
			string,
			TaxonomyAncestors & { specificHazardId: string }
		>();
		const specificHazards = new Map<string, TaxonomyAncestors>();
		const clusters = new Map<string, TaxonomyAncestors>();
		const types = new Map<string, { hazardTypeId: string }>();
		if (branches.length === 0) {
			return { hazards, specificHazards, clusters, types };
		}

		const result = await this.db.execute(sql.join(branches, sql` UNION ALL `));
		// db.execute() returns untyped raw rows; narrowed to this query's own projection.
		for (const row of result.rows as unknown as SourceRefRow[]) {
			const ancestors = {
				hazardClusterId: row.hazard_cluster_id ?? "",
				hazardTypeId: row.hazard_type_id,
			};
			if (row.kind === "hazard" && row.specific_hazard_id !== null) {
				hazards.set(row.key, {
					...ancestors,
					specificHazardId: row.specific_hazard_id,
				});
			} else if (row.kind === "specific") {
				specificHazards.set(row.key, ancestors);
			} else if (row.kind === "cluster") {
				clusters.set(row.key, ancestors);
			} else if (row.kind === "type") {
				types.set(row.key, { hazardTypeId: row.hazard_type_id });
			}
		}
		return { hazards, specificHazards, clusters, types };
	}
}
