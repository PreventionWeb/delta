import { Injectable, Inject } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Dr, Tx } from "~/db.server";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { hipHazardTable } from "~/drizzle/schema/hipHazardTable";
import { hipClusterTable } from "~/drizzle/schema/hipClusterTable";
import { hipTypeTable } from "~/drizzle/schema/hipTypeTable";
import type {
	HipCrosswalkIds,
	IHipCrosswalkPort,
} from "~/domains/hazardous-events/application/ports/IHipCrosswalkPort";
import { specificHazardTable } from "./specificHazardTable";
import { hazardClusterTable } from "./hazardClusterTable";
import { hazardTypeTable } from "./hazardTypeTable";

const NO_CROSSWALK: HipCrosswalkIds = {
	hipHazardId: null,
	hipClusterId: null,
	hipTypeId: null,
};

/** TEMPORARY migration-era scaffolding (DEF-055, design.md Decision 17) -- see
 * IHipCrosswalkPort.ts's own doc comment for the full removal plan. */
@Injectable()
export class DrizzleHipCrosswalkAdapter implements IHipCrosswalkPort {
	constructor(@Inject(DRIZZLE_CLIENT) private readonly db: Dr) {}

	/** One query, ancestor chain -> each level's own sourceRefId existence-checked against the
	 * live hip_hazard/hip_cluster/hip_class tables (left join; a null or dangling sourceRefId
	 * yields a null join, never a thrown error -- design.md Decision 17's defensive requirement).
	 * The hazardCluster/hazardType joins are inner: both FKs are NOT NULL on the CA taxonomy
	 * tables, so they're always present for any specificHazardId that exists at all. */
	async resolve(specificHazardId: string): Promise<HipCrosswalkIds> {
		const [row] = await this.db
			.select({
				hipHazardId: hipHazardTable.id,
				hipClusterId: hipClusterTable.id,
				hipTypeId: hipTypeTable.id,
			})
			.from(specificHazardTable)
			.innerJoin(
				hazardClusterTable,
				eq(hazardClusterTable.id, specificHazardTable.hazardClusterId),
			)
			.innerJoin(
				hazardTypeTable,
				eq(hazardTypeTable.id, hazardClusterTable.hazardTypeId),
			)
			.leftJoin(
				hipHazardTable,
				eq(hipHazardTable.id, specificHazardTable.sourceRefId),
			)
			.leftJoin(
				hipClusterTable,
				eq(hipClusterTable.id, hazardClusterTable.sourceRefId),
			)
			.leftJoin(hipTypeTable, eq(hipTypeTable.id, hazardTypeTable.sourceRefId))
			.where(eq(specificHazardTable.id, specificHazardId));

		// No matching specific_hazard row -- shouldn't happen (the caller already validated it via
		// HazardousEvent.create()), but degrades to "can't honestly resolve" rather than throwing.
		return row ?? NO_CROSSWALK;
	}

	/** Tenant-scoped, by id, inside the caller's own tx -- never called standalone. A tenant
	 * mismatch or missing id simply updates zero rows (same "no surprise throw" posture as
	 * resolve()); the caller's own prior write already established the row exists. */
	async stamp(
		eventId: string,
		tenantId: string,
		ids: HipCrosswalkIds,
		tx: Tx,
	): Promise<void> {
		await tx
			.update(hazardousEventTable)
			.set({
				hipHazardId: ids.hipHazardId,
				hipClusterId: ids.hipClusterId,
				hipTypeId: ids.hipTypeId,
			})
			.where(
				and(
					eq(hazardousEventTable.id, eventId),
					eq(hazardousEventTable.countryAccountsId, tenantId),
				),
			);
	}
}
