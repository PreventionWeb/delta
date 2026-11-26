import "../setup";
import { randomUUID } from "crypto";
import { beforeAll, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import { hipsVersionTable } from "~/domains/hazardous-events/infrastructure/hipsVersionTable";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";
import { hazardClusterTable } from "~/domains/hazardous-events/infrastructure/hazardClusterTable";
import { specificHazardTable } from "~/domains/hazardous-events/infrastructure/specificHazardTable";
import { DrizzleSpecificHazardTaxonomyRepository } from "~/domains/hazardous-events/infrastructure/DrizzleSpecificHazardTaxonomyRepository.server";
import { seedTextContent } from "../models/textContentTestHelpers";
import { seedSpecificHazard } from "../models/hazardousEventTestHelpers";

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
			const [seededRow] = await dr
				.select({ code: specificHazardTable.code })
				.from(specificHazardTable)
				.where(eq(specificHazardTable.id, id));
			const repo = new DrizzleSpecificHazardTaxonomyRepository(dr);

			const result = await repo.findNamesByIds([id]);

			expect(result.get(id)).toEqual({
				specificHazardName: "Cholera",
				hazardClusterName: "Infectious disease",
				hazardTypeName: "Biological",
				specificHazardCode: seededRow.code,
			});
		});

		it("includes specificHazardCode equal to the seeded specific_hazard.code value", async () => {
			const id = await seedTaxonomyChain({
				type: "Biological",
				cluster: "Infectious disease",
				specificHazard: "Cholera",
			});
			const [seededRow] = await dr
				.select({ code: specificHazardTable.code })
				.from(specificHazardTable)
				.where(eq(specificHazardTable.id, id));
			const repo = new DrizzleSpecificHazardTaxonomyRepository(dr);

			const result = await repo.findNamesByIds([id]);

			expect(result.get(id)?.specificHazardCode).toBe(seededRow.code);
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

	describe("listAll", () => {
		it("returns every hazard type, cluster, and specific hazard, each sorted by name", async () => {
			await seedTaxonomyChain({
				type: "Zebra Type",
				cluster: "Zebra Cluster",
				specificHazard: "Zebra Hazard",
			});
			await seedTaxonomyChain({
				type: "Alpha Type",
				cluster: "Alpha Cluster",
				specificHazard: "Alpha Hazard",
			});
			const repo = new DrizzleSpecificHazardTaxonomyRepository(dr);

			const result = await repo.listAll();

			const typeNames = result.types.map((t) => t.name);
			const clusterNames = result.clusters.map((c) => c.name);
			const specificHazardNames = result.specificHazards.map((h) => h.name);
			expect(typeNames).toEqual([...typeNames].sort());
			expect(clusterNames).toEqual([...clusterNames].sort());
			expect(specificHazardNames).toEqual([...specificHazardNames].sort());
			expect(typeNames).toEqual(
				expect.arrayContaining(["Zebra Type", "Alpha Type"]),
			);
			expect(clusterNames).toEqual(
				expect.arrayContaining(["Zebra Cluster", "Alpha Cluster"]),
			);
			expect(specificHazardNames).toEqual(
				expect.arrayContaining(["Zebra Hazard", "Alpha Hazard"]),
			);
		});

		it("includes clusterId and code on each specificHazards entry, matching the real row exactly", async () => {
			const id = await seedTaxonomyChain({
				type: "Biological",
				cluster: "Infectious disease",
				specificHazard: "Cholera",
			});
			const [seededRow] = await dr
				.select({
					hazardClusterId: specificHazardTable.hazardClusterId,
					code: specificHazardTable.code,
				})
				.from(specificHazardTable)
				.where(eq(specificHazardTable.id, id));
			const [seededCluster] = await dr
				.select({ hazardTypeId: hazardClusterTable.hazardTypeId })
				.from(hazardClusterTable)
				.where(eq(hazardClusterTable.id, seededRow.hazardClusterId));
			const repo = new DrizzleSpecificHazardTaxonomyRepository(dr);

			const result = await repo.listAll();

			const entry = result.specificHazards.find((h) => h.id === id);
			expect(entry).toBeDefined();
			expect(entry?.clusterId).toBe(seededRow.hazardClusterId);
			expect(entry?.code).toBe(seededRow.code);

			const clusterEntry = result.clusters.find(
				(c) => c.id === seededRow.hazardClusterId,
			);
			expect(clusterEntry).toBeDefined();
			expect(clusterEntry?.typeId).toBe(seededCluster.hazardTypeId);
			expect(
				result.types.some((t) => t.id === seededCluster.hazardTypeId),
			).toBe(true);
		});
	});
});

// ---------------------------------------------------------------------------
// ca-he-csv-migration tasks.md 5.2 -- specs/specific-hazard-taxonomy-repository-port
// (findBySourceRefIds).
// ---------------------------------------------------------------------------
interface SeededSourceRefChain {
	specificHazardId: string;
	hazardClusterId: string;
	hazardTypeId: string;
	hazardRef: string;
	clusterRef: string;
	typeRef: string;
}

/** source_ref_id is UNIQUE per table, so every ref is a fresh random string. */
async function seedSourceRefChain(): Promise<SeededSourceRefChain> {
	const refs = {
		hipTypeId: `type-ref-${randomUUID()}`,
		hipClusterId: `cluster-ref-${randomUUID()}`,
		hipHazardId: `hazard-ref-${randomUUID()}`,
	};
	const specificHazardId = await seedSpecificHazard(refs);
	const [sh] = await dr
		.select({ hazardClusterId: specificHazardTable.hazardClusterId })
		.from(specificHazardTable)
		.where(eq(specificHazardTable.id, specificHazardId));
	const [hc] = await dr
		.select({ hazardTypeId: hazardClusterTable.hazardTypeId })
		.from(hazardClusterTable)
		.where(eq(hazardClusterTable.id, sh.hazardClusterId));
	return {
		specificHazardId,
		hazardClusterId: sh.hazardClusterId,
		hazardTypeId: hc.hazardTypeId,
		hazardRef: refs.hipHazardId,
		clusterRef: refs.hipClusterId,
		typeRef: refs.hipTypeId,
	};
}

describe("DrizzleSpecificHazardTaxonomyRepository.findBySourceRefIds (ca-he-csv-migration D13)", () => {
	const repo = new DrizzleSpecificHazardTaxonomyRepository(dr);
	let chain: SeededSourceRefChain;

	beforeAll(async () => {
		// Warms PGlite and the adapter modules once, outside any per-test timeout.
		chain = await seedSourceRefChain();
	}, 60_000);

	it("Scenario: A hazard ref resolves with its ancestors -- { specificHazardId, hazardClusterId, hazardTypeId }", async () => {
		const result = await repo.findBySourceRefIds({
			hazardRefs: [chain.hazardRef],
			clusterRefs: [],
			typeRefs: [],
		});

		expect(result.hazards.get(chain.hazardRef)).toEqual({
			specificHazardId: chain.specificHazardId,
			hazardClusterId: chain.hazardClusterId,
			hazardTypeId: chain.hazardTypeId,
		});
		expect(result.hazards.size).toBe(1);
	});

	it("a cluster ref resolves to its id and type; a type ref resolves to its id", async () => {
		const result = await repo.findBySourceRefIds({
			hazardRefs: [],
			clusterRefs: [chain.clusterRef],
			typeRefs: [chain.typeRef],
		});

		expect(result.clusters.get(chain.clusterRef)).toEqual({
			hazardClusterId: chain.hazardClusterId,
			hazardTypeId: chain.hazardTypeId,
		});
		expect(result.types.get(chain.typeRef)).toEqual({
			hazardTypeId: chain.hazardTypeId,
		});
		expect(result.hazards.size).toBe(0);
	});

	it("a CA id in specificHazardIds resolves its ancestors in result.specificHazards", async () => {
		const result = await repo.findBySourceRefIds({
			hazardRefs: [],
			clusterRefs: [],
			typeRefs: [],
			specificHazardIds: [chain.specificHazardId],
		});

		expect(result.specificHazards.get(chain.specificHazardId)).toEqual({
			hazardClusterId: chain.hazardClusterId,
			hazardTypeId: chain.hazardTypeId,
		});
	});

	it("Scenario: An unknown ref is absent, not an error -- 99999999 resolves and is not in the result", async () => {
		const result = await repo.findBySourceRefIds({
			hazardRefs: ["99999999", chain.hazardRef],
			clusterRefs: ["99999999"],
			typeRefs: ["99999999"],
			specificHazardIds: [randomUUID()],
		});

		expect(result.hazards.has("99999999")).toBe(false);
		expect(result.clusters.has("99999999")).toBe(false);
		expect(result.types.has("99999999")).toBe(false);
		expect(result.specificHazards.size).toBe(0);
		expect(result.hazards.has(chain.hazardRef)).toBe(true);
	});

	it("all-empty input resolves to empty maps", async () => {
		const result = await repo.findBySourceRefIds({
			hazardRefs: [],
			clusterRefs: [],
			typeRefs: [],
		});

		expect(result.hazards.size).toBe(0);
		expect(result.clusters.size).toBe(0);
		expect(result.types.size).toBe(0);
		expect(result.specificHazards.size).toBe(0);
	});

	it("Scenario: Many refs use one query -- 500 hazard refs issue exactly one database query", async () => {
		const second = await seedSourceRefChain();
		const hazardRefs = [
			chain.hazardRef,
			second.hazardRef,
			...Array.from({ length: 498 }, () => `unknown-${randomUUID()}`),
		];
		const executeSpy = vi.spyOn(dr, "execute");
		const selectSpy = vi.spyOn(dr, "select");

		try {
			const result = await repo.findBySourceRefIds({
				hazardRefs,
				clusterRefs: [],
				typeRefs: [],
			});

			expect(hazardRefs).toHaveLength(500);
			expect(executeSpy).toHaveBeenCalledTimes(1);
			expect(selectSpy).not.toHaveBeenCalled();
			expect(result.hazards.size).toBe(2);
			expect(result.hazards.get(second.hazardRef)?.specificHazardId).toBe(
				second.specificHazardId,
			);
		} finally {
			executeSpy.mockRestore();
			selectSpy.mockRestore();
		}
	});

	it("Scenario: Concurrent callers get the same answer -- two simultaneous calls resolve to equal results", async () => {
		const refs = {
			hazardRefs: [chain.hazardRef, "99999999"],
			clusterRefs: [chain.clusterRef],
			typeRefs: [chain.typeRef],
			specificHazardIds: [chain.specificHazardId],
		};

		const [first, second] = await Promise.all([
			repo.findBySourceRefIds(refs),
			repo.findBySourceRefIds(refs),
		]);

		expect(second).toEqual(first);
		expect(first.hazards.size).toBe(1);
	});
});

describe("findBySourceRefIds binds each list as one array parameter (review m6)", () => {
	it("resolves 70,000 distinct unknown hazard refs without exceeding the bind-parameter limit", async () => {
		const repo = new DrizzleSpecificHazardTaxonomyRepository(dr);
		const hazardRefs = Array.from({ length: 70_000 }, (_, i) => `none-${i}`);

		const result = await repo.findBySourceRefIds({
			hazardRefs,
			clusterRefs: [],
			typeRefs: [],
		});

		expect(result.hazards.size).toBe(0);
	});
});
