import "../setup";
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

describe("specificHazardTable", () => {
	it("inserts a row under an existing hazard_cluster", async () => {
		const hazardClusterId = await insertHazardCluster();

		const [row] = await dr
			.insert(specificHazardTable)
			.values({ name: "Earthquake", code: "GH0001", hazardClusterId })
			.returning();

		expect(row.hazardClusterId).toBe(hazardClusterId);
	});

	it("rejects an insert whose hazard_cluster_id matches no hazard_cluster row", async () => {
		await expect(
			dr
				.insert(specificHazardTable)
				.values({
					name: "Earthquake",
					code: "GH0001",
					hazardClusterId: crypto.randomUUID(),
				})
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with hazard_cluster_id = NULL", async () => {
		await expect(
			dr
				.insert(specificHazardTable)
				// @ts-expect-error hazardClusterId is required
				.values({ name: "Earthquake", code: "GH0001" })
				.returning(),
		).rejects.toThrow();
	});
});
