import "../setup";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hipsVersionTable } from "~/domains/hazardous-events/infrastructure/hipsVersionTable";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";

async function insertHipsVersion(): Promise<string> {
	const [row] = await dr
		.insert(hipsVersionTable)
		.values({ versionNo: "HIPs 2025" })
		.returning({ id: hipsVersionTable.id });
	return row.id;
}

describe("hazardTypeTable", () => {
	it("inserts a row under an existing hips_version", async () => {
		const hipsVersionId = await insertHipsVersion();

		const [row] = await dr
			.insert(hazardTypeTable)
			.values({ name: "Geohazards", hipsVersionId })
			.returning();

		expect(row.hipsVersionId).toBe(hipsVersionId);
	});

	it("rejects an insert whose hips_version_id matches no hips_version row", async () => {
		await expect(
			dr
				.insert(hazardTypeTable)
				.values({ name: "Geohazards", hipsVersionId: crypto.randomUUID() })
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with hips_version_id = NULL", async () => {
		await expect(
			dr
				.insert(hazardTypeTable)
				// @ts-expect-error hipsVersionId is required
				.values({ name: "Geohazards" })
				.returning(),
		).rejects.toThrow();
	});
});
