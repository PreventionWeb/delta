import { Injectable, Inject } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import type { Dr } from "~/db.server";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import type { IHazardTaxonomyRepository } from "../application/ports/IHazardTaxonomyRepository";
import { hazardDriverTable } from "./hazardDriverTable";
import { hazardTypeCustomFieldDefinitionTable } from "./hazardTypeCustomFieldDefinitionTable";

@Injectable()
export class DrizzleHazardTaxonomyRepository implements IHazardTaxonomyRepository {
	constructor(@Inject(DRIZZLE_CLIENT) private readonly db: Dr) {}

	/** Shared by both methods — each table is a plain tenant+id membership check (design.md Decision 3). */
	private async resolveValidIds(
		table:
			| typeof hazardDriverTable
			| typeof hazardTypeCustomFieldDefinitionTable,
		ids: readonly string[],
		tenantId: string,
	): Promise<ReadonlySet<string>> {
		// No query issued for an empty input — matches the port's spec, and avoids an `IN ()`
		// query shape some drivers reject outright.
		if (ids.length === 0) {
			return new Set();
		}
		const rows = await this.db
			.select({ id: table.id })
			.from(table)
			.where(
				and(eq(table.countryAccountsId, tenantId), inArray(table.id, [...ids])),
			);
		return new Set(rows.map((row) => row.id));
	}

	async findValidHazardDriverIds(
		ids: readonly string[],
		tenantId: string,
	): Promise<ReadonlySet<string>> {
		return this.resolveValidIds(hazardDriverTable, ids, tenantId);
	}

	async findValidCustomFieldDefinitionIds(
		ids: readonly string[],
		tenantId: string,
	): Promise<ReadonlySet<string>> {
		return this.resolveValidIds(
			hazardTypeCustomFieldDefinitionTable,
			ids,
			tenantId,
		);
	}
}
