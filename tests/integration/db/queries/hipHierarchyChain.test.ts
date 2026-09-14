import "../setup";
import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hipsVersionTable } from "~/domains/hazardous-events/infrastructure/hipsVersionTable";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";
import { hazardClusterTable } from "~/domains/hazardous-events/infrastructure/hazardClusterTable";
import { specificHazardTable } from "~/domains/hazardous-events/infrastructure/specificHazardTable";

async function insertHazardCluster(): Promise<string> {
	const [version] = await dr
		.insert(hipsVersionTable)
		.values({ versionNo: "HIPs 2025" })
		.returning({ id: hipsVersionTable.id });
	const [type] = await dr
		.insert(hazardTypeTable)
		.values({ name: "Geohazards", hipsVersionId: version.id })
		.returning({ id: hazardTypeTable.id });
	const [cluster] = await dr
		.insert(hazardClusterTable)
		.values({ name: "Seismogenic (Earthquakes)", hazardTypeId: type.id })
		.returning({ id: hazardClusterTable.id });
	return cluster.id;
}

describe("hip hierarchy chain integrity", () => {
	it("rejects deleting a hazard_cluster referenced by a specific_hazard row", async () => {
		const hazardClusterId = await insertHazardCluster();
		await dr
			.insert(specificHazardTable)
			.values({ name: "Earthquake", code: "GH0001", hazardClusterId });

		await expect(
			dr
				.delete(hazardClusterTable)
				.where(eq(hazardClusterTable.id, hazardClusterId)),
		).rejects.toThrow();
	});

	it("allows two concurrent specific_hazard inserts against the same hazard_cluster_id", async () => {
		const hazardClusterId = await insertHazardCluster();

		const outcomes = await Promise.all([
			dr
				.insert(specificHazardTable)
				.values({ name: "Earthquake", code: "GH0001", hazardClusterId })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(specificHazardTable)
				.values({ name: "Tsunami", code: "GH0002", hazardClusterId })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});
});
