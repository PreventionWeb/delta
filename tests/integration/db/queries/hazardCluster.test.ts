import "../setup";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hipsVersionTable } from "~/domains/hazardous-events/infrastructure/hipsVersionTable";
import { hazardTypeTable } from "~/domains/hazardous-events/infrastructure/hazardTypeTable";
import { hazardClusterTable } from "~/domains/hazardous-events/infrastructure/hazardClusterTable";

async function insertHazardType(): Promise<string> {
	const [version] = await dr
		.insert(hipsVersionTable)
		.values({ versionNo: "HIPs 2025" })
		.returning({ id: hipsVersionTable.id });
	const [type] = await dr
		.insert(hazardTypeTable)
		.values({ name: "Geohazards", hipsVersionId: version.id })
		.returning({ id: hazardTypeTable.id });
	return type.id;
}

describe("hazardClusterTable", () => {
	it("inserts a row under an existing hazard_type", async () => {
		const hazardTypeId = await insertHazardType();

		const [row] = await dr
			.insert(hazardClusterTable)
			.values({ name: "Seismogenic (Earthquakes)", hazardTypeId })
			.returning();

		expect(row.hazardTypeId).toBe(hazardTypeId);
	});

	it("rejects an insert whose hazard_type_id matches no hazard_type row", async () => {
		await expect(
			dr
				.insert(hazardClusterTable)
				.values({
					name: "Seismogenic (Earthquakes)",
					hazardTypeId: crypto.randomUUID(),
				})
				.returning(),
		).rejects.toThrow();
	});

	it("rejects an insert with hazard_type_id = NULL", async () => {
		await expect(
			dr
				.insert(hazardClusterTable)
				// @ts-expect-error hazardTypeId is required
				.values({ name: "Seismogenic (Earthquakes)" })
				.returning(),
		).rejects.toThrow();
	});
});
