import "../setup";
import { randomUUID } from "crypto";
import { describe, it, expect, vi } from "vitest";
import { dr } from "~/db.server";
import { hipsVersionTable } from "~/domains/hazardous-events/infrastructure/hipsVersionTable";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";
import { hazardClusterTable } from "~/domains/hazardous-events/infrastructure/hazardClusterTable";
import { specificHazardTable } from "~/domains/hazardous-events/infrastructure/specificHazardTable";
import { DrizzleSpecificHazardTaxonomyRepository } from "~/domains/hazardous-events/infrastructure/DrizzleSpecificHazardTaxonomyRepository.server";
import { seedTextContent } from "../models/textContentTestHelpers";

/** Full real-schema chain (hipsVersion -> hazardType -> hazardCluster -> specificHazard), each
 * level with its own distinct name, so a test can assert all three resolved levels independently. */
async function seedTaxonomyChain(names: {
	type: string;
	cluster: string;
	specificHazard: string;
}): Promise<string> {
	const [hipsVersion] = await dr
		.insert(hipsVersionTable)
		.values({ versionNo: `HIPs ${randomUUID()}` })
		.returning({ id: hipsVersionTable.id });
	const [type] = await dr
		.insert(hazardTypeTable)
		.values({
			id: randomUUID(),
			nameTextContentId: await seedTextContent(names.type),
			hipsVersionId: hipsVersion.id,
		})
		.returning({ id: hazardTypeTable.id });
	const [cluster] = await dr
		.insert(hazardClusterTable)
		.values({
			id: randomUUID(),
			nameTextContentId: await seedTextContent(names.cluster),
			hazardTypeId: type.id,
		})
		.returning({ id: hazardClusterTable.id });
	const [specificHazard] = await dr
		.insert(specificHazardTable)
		.values({
			id: randomUUID(),
			nameTextContentId: await seedTextContent(names.specificHazard),
			code: `code-${randomUUID()}`,
			hazardClusterId: cluster.id,
		})
		.returning({ id: specificHazardTable.id });
	return specificHazard.id;
}

describe("DrizzleSpecificHazardTaxonomyRepository", () => {
	describe("findNamesByIds", () => {
		it("resolves the specific-hazard, cluster, and type names for a matching id", async () => {
			const id = await seedTaxonomyChain({
				type: "Biological",
				cluster: "Infectious disease",
				specificHazard: "Cholera",
			});
			const repo = new DrizzleSpecificHazardTaxonomyRepository(dr);

			const result = await repo.findNamesByIds([id]);

			expect(result.get(id)).toEqual({
				specificHazardName: "Cholera",
				hazardClusterName: "Infectious disease",
				hazardTypeName: "Biological",
			});
		});

		it("omits a non-existent id from the result, without throwing", async () => {
			const repo = new DrizzleSpecificHazardTaxonomyRepository(dr);

			const result = await repo.findNamesByIds([randomUUID()]);

			expect(result.size).toBe(0);
		});

		it("resolves an empty map for an empty ids array without issuing a query", async () => {
			const repo = new DrizzleSpecificHazardTaxonomyRepository(dr);
			const selectSpy = vi.spyOn(dr, "select");

			const result = await repo.findNamesByIds([]);

			expect(result.size).toBe(0);
			expect(selectSpy).not.toHaveBeenCalled();
			selectSpy.mockRestore();
		});

		it("resolves names for multiple distinct ids in one call", async () => {
			const firstId = await seedTaxonomyChain({
				type: "Hydrometeorological",
				cluster: "Flood",
				specificHazard: "Flash Flooding",
			});
			const secondId = await seedTaxonomyChain({
				type: "Hydrometeorological",
				cluster: "Drought",
				specificHazard: "Drought",
			});
			const repo = new DrizzleSpecificHazardTaxonomyRepository(dr);

			const result = await repo.findNamesByIds([firstId, secondId]);

			expect(result.get(firstId)?.specificHazardName).toBe("Flash Flooding");
			expect(result.get(secondId)?.specificHazardName).toBe("Drought");
		});
	});
});
