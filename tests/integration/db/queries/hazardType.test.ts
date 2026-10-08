import "../setup";
import { randomUUID } from "crypto";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hipsVersionTable } from "~/domains/hazardous-events/infrastructure/hipsVersionTable";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";
import { seedTextContent } from "../models/textContentTestHelpers";

async function insertHipsVersion(): Promise<string> {
	const [row] = await dr
		.insert(hipsVersionTable)
		.values({ versionNo: `HIPs ${randomUUID()}` })
		.returning({ id: hipsVersionTable.id });
	return row.id;
}

describe("hazardTypeTable", () => {
	it("inserts a row under an existing hips_version", async () => {
		const hipsVersionId = await insertHipsVersion();
		const nameTextContentId = await seedTextContent("Geohazards");

		const [row] = await dr
			.insert(hazardTypeTable)
			.values({ nameTextContentId, hipsVersionId })
			.returning();

		expect(row.hipsVersionId).toBe(hipsVersionId);
	});

	it("rejects an insert whose hips_version_id matches no hips_version row", async () => {
		const nameTextContentId = await seedTextContent("Geohazards");

		await expect(
			dr
				.insert(hazardTypeTable)
				.values({ nameTextContentId, hipsVersionId: randomUUID() })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with hips_version_id = NULL", async () => {
		const nameTextContentId = await seedTextContent("Geohazards");

		await expect(
			dr
				.insert(hazardTypeTable)
				// @ts-expect-error hipsVersionId is required
				.values({ nameTextContentId })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with name_text_content_id = NULL", async () => {
		const hipsVersionId = await insertHipsVersion();

		await expect(
			dr
				.insert(hazardTypeTable)
				// @ts-expect-error nameTextContentId is required
				.values({ hipsVersionId })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert whose name_text_content_id matches no text_content row", async () => {
		const hipsVersionId = await insertHipsVersion();

		await expect(
			dr
				.insert(hazardTypeTable)
				.values({ nameTextContentId: randomUUID(), hipsVersionId })
				.returning(),
		).rejects.toThrow();
	});

	it("allows an insert with no source_ref_id", async () => {
		const hipsVersionId = await insertHipsVersion();
		const nameTextContentId = await seedTextContent("Geohazards");

		const [row] = await dr
			.insert(hazardTypeTable)
			.values({ nameTextContentId, hipsVersionId })
			.returning();

		expect(row.sourceRefId).toBeNull();
	});

	it("rejects an insert with a duplicate non-null source_ref_id", async () => {
		const hipsVersionId = await insertHipsVersion();
		const sourceRefId = `src-${randomUUID()}`;
		await dr.insert(hazardTypeTable).values({
			nameTextContentId: await seedTextContent("Geohazards"),
			hipsVersionId,
			sourceRefId,
		});

		await expect(
			dr.insert(hazardTypeTable).values({
				nameTextContentId: await seedTextContent("Geohazards (dup)"),
				hipsVersionId,
				sourceRefId,
			}),
		).rejects.toThrow();
	});

	it("allows two rows with no source_ref_id", async () => {
		const hipsVersionId = await insertHipsVersion();

		const outcomes = await Promise.all([
			dr
				.insert(hazardTypeTable)
				.values({
					nameTextContentId: await seedTextContent("Geohazards A"),
					hipsVersionId,
				})
				.returning(),
			dr
				.insert(hazardTypeTable)
				.values({
					nameTextContentId: await seedTextContent("Geohazards B"),
					hipsVersionId,
				})
				.returning(),
		]);

		expect(outcomes).toHaveLength(2);
	});

	it("allows exactly one of two concurrent inserts with the same non-null source_ref_id to succeed", async () => {
		const hipsVersionId = await insertHipsVersion();
		const sourceRefId = `src-${randomUUID()}`;
		const [nameA, nameB] = await Promise.all([
			seedTextContent("Geohazards A"),
			seedTextContent("Geohazards B"),
		]);

		const outcomes = await Promise.all([
			dr
				.insert(hazardTypeTable)
				.values({ nameTextContentId: nameA, hipsVersionId, sourceRefId })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(hazardTypeTable)
				.values({ nameTextContentId: nameB, hipsVersionId, sourceRefId })
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
