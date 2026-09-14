import "../setup";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hazardClusterTable } from "~/domains/hazardous-events/infrastructure/hazardClusterTable";
import { specificHazardTable } from "~/domains/hazardous-events/infrastructure/specificHazardTable";
import { eventTable } from "../testSchema/eventTable";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { baseFields } from "../models/hazardousEventTestHelpers";
import { seedHazardType } from "../models/hazardTypeFieldDefinitionTestHelpers";

async function seedSpecificHazard() {
	const hazardType = await seedHazardType();
	const [cluster] = await dr
		.insert(hazardClusterTable)
		.values({ name: `Cluster ${randomUUID()}`, hazardTypeId: hazardType.id })
		.returning({ id: hazardClusterTable.id });
	const [hazard] = await dr
		.insert(specificHazardTable)
		.values({
			name: `Hazard ${randomUUID()}`,
			code: `code-${randomUUID()}`,
			hazardClusterId: cluster.id,
		})
		.returning({ id: specificHazardTable.id });
	return hazard.id;
}

// Direct insert bypassing the model layer — specificHazardId isn't a model field yet (schema-only intent).
async function seedHazardousEventWithSpecificHazard(
	specificHazardId?: string | null,
) {
	const fields = await baseFields();
	const [ev] = await dr
		.insert(eventTable)
		.values({ name: fields.name, description: fields.description })
		.returning({ id: eventTable.id });
	await dr.insert(hazardousEventTable).values({
		id: ev.id,
		countryAccountsId: fields.countryAccountsId,
		hipHazardId: fields.hipHazardId,
		hipClusterId: fields.hipClusterId,
		hipTypeId: fields.hipTypeId,
		recordOriginator: fields.recordOriginator,
		description: fields.description,
		attachments: [],
		specificHazardId,
	});
	return ev.id;
}

describe("hazardous_event.specific_hazard_id", () => {
	it("allows an insert with specific_hazard_id omitted/NULL", async () => {
		const id = await seedHazardousEventWithSpecificHazard();

		const [row] = await dr
			.select({ specificHazardId: hazardousEventTable.specificHazardId })
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, id));

		expect(row.specificHazardId).toBeNull();
	});

	it("allows an insert with specific_hazard_id set to an existing specific_hazard row", async () => {
		const specificHazardId = await seedSpecificHazard();

		const id = await seedHazardousEventWithSpecificHazard(specificHazardId);

		const [row] = await dr
			.select({ specificHazardId: hazardousEventTable.specificHazardId })
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, id));

		expect(row.specificHazardId).toBe(specificHazardId);
	});

	it("allows an update setting specific_hazard_id to an existing specific_hazard row", async () => {
		const id = await seedHazardousEventWithSpecificHazard();
		const specificHazardId = await seedSpecificHazard();

		await dr
			.update(hazardousEventTable)
			.set({ specificHazardId })
			.where(eq(hazardousEventTable.id, id));

		const [row] = await dr
			.select({ specificHazardId: hazardousEventTable.specificHazardId })
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, id));

		expect(row.specificHazardId).toBe(specificHazardId);
	});

	it("rejects a specific_hazard_id matching no specific_hazard row", async () => {
		await expect(
			seedHazardousEventWithSpecificHazard(randomUUID()),
		).rejects.toThrow();
	});

	describe("restrict-delete behaviour", () => {
		it("rejects deleting a specific_hazard row still referenced by a hazardous_event row", async () => {
			const specificHazardId = await seedSpecificHazard();
			await seedHazardousEventWithSpecificHazard(specificHazardId);

			await expect(
				dr
					.delete(specificHazardTable)
					.where(eq(specificHazardTable.id, specificHazardId)),
			).rejects.toThrow();
		});
	});

	describe("concurrent access", () => {
		it("allows two concurrent inserts referencing the same specific_hazard row", async () => {
			const specificHazardId = await seedSpecificHazard();

			const outcomes = await Promise.all([
				seedHazardousEventWithSpecificHazard(specificHazardId).then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
				seedHazardousEventWithSpecificHazard(specificHazardId).then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			]);

			expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
		});
	});
});
