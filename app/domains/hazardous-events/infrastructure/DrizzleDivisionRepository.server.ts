import { Injectable, Inject } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import type { Dr, Tx } from "~/db.server";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import type { IDivisionRepository } from "../application/ports/IDivisionRepository";

/** A null `countryAccountsId` row never matches `eq(..., tenantId)`, so no `IS NOT NULL` guard is needed. */
@Injectable()
export class DrizzleDivisionRepository implements IDivisionRepository {
	constructor(@Inject(DRIZZLE_CLIENT) private readonly db: Dr) {}

	async findValidDivisionIds(
		ids: readonly string[],
		tenantId: string,
		tx?: Tx,
	): Promise<ReadonlySet<string>> {
		// Avoids an `IN ()` query shape some drivers reject outright.
		if (ids.length === 0) {
			return new Set();
		}
		const rows = await (tx ?? this.db)
			.select({ id: divisionTable.id })
			.from(divisionTable)
			.where(
				and(
					eq(divisionTable.countryAccountsId, tenantId),
					inArray(divisionTable.id, [...ids]),
				),
			);
		return new Set(rows.map((row) => row.id));
	}
}
