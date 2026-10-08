import "../setup";
import { randomUUID } from "crypto";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hipsVersionTable } from "~/domains/hazardous-events/infrastructure/hipsVersionTable";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";
import { hazardClusterTable } from "~/domains/hazardous-events/infrastructure/hazardClusterTable";
import { specificHazardTable } from "~/domains/hazardous-events/infrastructure/specificHazardTable";
import { seedTextContent } from "../models/textContentTestHelpers";

async function insertHazardCluster(): Promise<string> {
	const [version] = await dr
		.insert(hipsVersionTable)
		.values({ versionNo: `HIPs ${randomUUID()}` })
		.returning({ id: hipsVersionTable.id });
	const [type] = await dr
		.insert(hazardTypeTable)
		.values({
			nameTextContentId: await seedTextContent("Geohazards"),
			hipsVersionId: version.id,
		})
		.returning({ id: hazardTypeTable.id });
	const [cluster] = await dr
		.insert(hazardClusterTable)
		.values({
			nameTextContentId: await seedTextContent("Seismogenic (Earthquakes)"),
			hazardTypeId: type.id,
		})
		.returning({ id: hazardClusterTable.id });
	return cluster.id;
}

describe("specificHazardTable", () => {
	it("inserts a row under an existing hazard_cluster", async () => {
		const hazardClusterId = await insertHazardCluster();
		const nameTextContentId = await seedTextContent("Earthquake");

		const [row] = await dr
			.insert(specificHazardTable)
			.values({ nameTextContentId, code: "GH0001", hazardClusterId })
			.returning();

		expect(row.hazardClusterId).toBe(hazardClusterId);
	});

	it("rejects an insert whose hazard_cluster_id matches no hazard_cluster row", async () => {
		const nameTextContentId = await seedTextContent("Earthquake");

		await expect(
			dr
				.insert(specificHazardTable)
				.values({
					nameTextContentId,
					code: "GH0001",
					hazardClusterId: randomUUID(),
				})
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with hazard_cluster_id = NULL", async () => {
		const nameTextContentId = await seedTextContent("Earthquake");

		await expect(
			dr
				.insert(specificHazardTable)
				// @ts-expect-error hazardClusterId is required
				.values({ nameTextContentId, code: "GH0001" })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with name_text_content_id = NULL", async () => {
		const hazardClusterId = await insertHazardCluster();

		await expect(
			dr
				.insert(specificHazardTable)
				// @ts-expect-error nameTextContentId is required
				.values({ code: "GH0001", hazardClusterId })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert whose name_text_content_id matches no text_content row", async () => {
		const hazardClusterId = await insertHazardCluster();

		await expect(
			dr
				.insert(specificHazardTable)
				.values({
					nameTextContentId: randomUUID(),
					code: "GH0001",
					hazardClusterId,
				})
				.returning(),
		).rejects.toThrow();
	});

	it("allows an insert with description_text_content_id = NULL", async () => {
		const hazardClusterId = await insertHazardCluster();
		const nameTextContentId = await seedTextContent("Earthquake");

		const [row] = await dr
			.insert(specificHazardTable)
			.values({ nameTextContentId, code: "GH0001", hazardClusterId })
			.returning();

		expect(row.descriptionTextContentId).toBeNull();
	});

	it("allows an insert with a valid description_text_content_id", async () => {
		const hazardClusterId = await insertHazardCluster();
		const nameTextContentId = await seedTextContent("Earthquake");
		const descriptionTextContentId = await seedTextContent(
			"Sudden ground shaking caused by tectonic movement",
		);

		const [row] = await dr
			.insert(specificHazardTable)
			.values({
				nameTextContentId,
				code: "GH0001",
				hazardClusterId,
				descriptionTextContentId,
			})
			.returning();

		expect(row.descriptionTextContentId).toBe(descriptionTextContentId);
	});

	it("rejects an insert whose description_text_content_id matches no text_content row", async () => {
		const hazardClusterId = await insertHazardCluster();
		const nameTextContentId = await seedTextContent("Earthquake");

		await expect(
			dr
				.insert(specificHazardTable)
				.values({
					nameTextContentId,
					code: "GH0001",
					hazardClusterId,
					descriptionTextContentId: randomUUID(),
				})
				.returning(),
		).rejects.toThrow();
	});

	it("allows an insert with no source_ref_id", async () => {
		const hazardClusterId = await insertHazardCluster();
		const nameTextContentId = await seedTextContent("Earthquake");

		const [row] = await dr
			.insert(specificHazardTable)
			.values({ nameTextContentId, code: "GH0001", hazardClusterId })
			.returning();

		expect(row.sourceRefId).toBeNull();
	});

	it("rejects an insert with a duplicate non-null source_ref_id", async () => {
		const hazardClusterId = await insertHazardCluster();
		const sourceRefId = `src-${randomUUID()}`;
		await dr.insert(specificHazardTable).values({
			nameTextContentId: await seedTextContent("Earthquake"),
			code: "GH0001",
			hazardClusterId,
			sourceRefId,
		});

		await expect(
			dr.insert(specificHazardTable).values({
				nameTextContentId: await seedTextContent("Earthquake (dup)"),
				code: "GH0002",
				hazardClusterId,
				sourceRefId,
			}),
		).rejects.toThrow();
	});

	it("allows two rows with no source_ref_id", async () => {
		const hazardClusterId = await insertHazardCluster();

		const outcomes = await Promise.all([
			dr
				.insert(specificHazardTable)
				.values({
					nameTextContentId: await seedTextContent("Earthquake A"),
					code: "GH0001",
					hazardClusterId,
				})
				.returning(),
			dr
				.insert(specificHazardTable)
				.values({
					nameTextContentId: await seedTextContent("Earthquake B"),
					code: "GH0002",
					hazardClusterId,
				})
				.returning(),
		]);

		expect(outcomes).toHaveLength(2);
	});

	it("allows exactly one of two concurrent inserts with the same non-null source_ref_id to succeed", async () => {
		const hazardClusterId = await insertHazardCluster();
		const sourceRefId = `src-${randomUUID()}`;
		const [nameA, nameB] = await Promise.all([
			seedTextContent("Earthquake A"),
			seedTextContent("Earthquake B"),
		]);

		const outcomes = await Promise.all([
			dr
				.insert(specificHazardTable)
				.values({
					nameTextContentId: nameA,
					code: "GH0001",
					hazardClusterId,
					sourceRefId,
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(specificHazardTable)
				.values({
					nameTextContentId: nameB,
					code: "GH0002",
					hazardClusterId,
					sourceRefId,
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes.filter((o) => o === "fulfilled")).toHaveLength(1);
		expect(outcomes.filter((o) => o === "rejected")).toHaveLength(1);
	});
});
