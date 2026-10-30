import { Injectable, Inject } from "@nestjs/common";
import { asc, eq, inArray } from "drizzle-orm";
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
	SpecificHazardTaxonomyNames,
} from "../application/ports/ISpecificHazardTaxonomyRepository";

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
}
