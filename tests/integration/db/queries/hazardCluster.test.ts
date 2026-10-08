import "../setup";
import { randomUUID } from "crypto";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hipsVersionTable } from "~/domains/hazardous-events/infrastructure/hipsVersionTable";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";
import { hazardClusterTable } from "~/domains/hazardous-events/infrastructure/hazardClusterTable";
import { seedTextContent } from "../models/textContentTestHelpers";

async function insertHazardType(): Promise<string> {
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
	return type.id;
}

describe("hazardClusterTable", () => {
	it("inserts a row under an existing hazard_type", async () => {
		const hazardTypeId = await insertHazardType();
		const nameTextContentId = await seedTextContent(
			"Seismogenic (Earthquakes)",
		);

		const [row] = await dr
			.insert(hazardClusterTable)
			.values({ nameTextContentId, hazardTypeId })
			.returning();

		expect(row.hazardTypeId).toBe(hazardTypeId);
	});

	it("rejects an insert whose hazard_type_id matches no hazard_type row", async () => {
		const nameTextContentId = await seedTextContent(
			"Seismogenic (Earthquakes)",
		);

		await expect(
			dr
				.insert(hazardClusterTable)
				.values({ nameTextContentId, hazardTypeId: randomUUID() })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with hazard_type_id = NULL", async () => {
		const nameTextContentId = await seedTextContent(
			"Seismogenic (Earthquakes)",
		);

		await expect(
			dr
				.insert(hazardClusterTable)
				// @ts-expect-error hazardTypeId is required
				.values({ nameTextContentId })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with name_text_content_id = NULL", async () => {
		const hazardTypeId = await insertHazardType();

		await expect(
			dr
				.insert(hazardClusterTable)
				// @ts-expect-error nameTextContentId is required
				.values({ hazardTypeId })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert whose name_text_content_id matches no text_content row", async () => {
		const hazardTypeId = await insertHazardType();

		await expect(
			dr
				.insert(hazardClusterTable)
				.values({ nameTextContentId: randomUUID(), hazardTypeId })
				.returning(),
		).rejects.toThrow();
	});

	it("allows an insert with no source_ref_id", async () => {
		const hazardTypeId = await insertHazardType();
		const nameTextContentId = await seedTextContent(
			"Seismogenic (Earthquakes)",
		);

		const [row] = await dr
			.insert(hazardClusterTable)
			.values({ nameTextContentId, hazardTypeId })
			.returning();

		expect(row.sourceRefId).toBeNull();
	});

	it("rejects an insert with a duplicate non-null source_ref_id", async () => {
		const hazardTypeId = await insertHazardType();
		const sourceRefId = `src-${randomUUID()}`;
		await dr.insert(hazardClusterTable).values({
			nameTextContentId: await seedTextContent("Seismogenic"),
			hazardTypeId,
			sourceRefId,
		});

		await expect(
			dr.insert(hazardClusterTable).values({
				nameTextContentId: await seedTextContent("Seismogenic (dup)"),
				hazardTypeId,
				sourceRefId,
			}),
		).rejects.toThrow();
	});

	it("allows two rows with no source_ref_id", async () => {
		const hazardTypeId = await insertHazardType();

		const outcomes = await Promise.all([
			dr
				.insert(hazardClusterTable)
				.values({
					nameTextContentId: await seedTextContent("Seismogenic A"),
					hazardTypeId,
				})
				.returning(),
			dr
				.insert(hazardClusterTable)
				.values({
					nameTextContentId: await seedTextContent("Seismogenic B"),
					hazardTypeId,
				})
				.returning(),
		]);

		expect(outcomes).toHaveLength(2);
	});

	it("allows exactly one of two concurrent inserts with the same non-null source_ref_id to succeed", async () => {
		const hazardTypeId = await insertHazardType();
		const sourceRefId = `src-${randomUUID()}`;
		const [nameA, nameB] = await Promise.all([
			seedTextContent("Seismogenic A"),
			seedTextContent("Seismogenic B"),
		]);

		const outcomes = await Promise.all([
			dr
				.insert(hazardClusterTable)
				.values({ nameTextContentId: nameA, hazardTypeId, sourceRefId })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(hazardClusterTable)
				.values({ nameTextContentId: nameB, hazardTypeId, sourceRefId })
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
