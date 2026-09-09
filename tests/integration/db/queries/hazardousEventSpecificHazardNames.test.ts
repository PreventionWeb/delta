import "../setup";
import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { eventTable } from "../testSchema/eventTable";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { baseFields } from "../models/hazardousEventTestHelpers";

// Direct insert bypassing the model layer — neither column is a model field yet (schema-only intent).
async function seedHazardousEventWithSpecificHazardNames(overrides?: {
	specificHazardLocalName?: string | null;
	specificHazardNationalName?: string | null;
}) {
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
		...overrides,
	});
	return ev.id;
}

describe("hazardous_event.specific_hazard_local_name / specific_hazard_national_name", () => {
	it("allows an insert with both columns omitted/NULL", async () => {
		const id = await seedHazardousEventWithSpecificHazardNames();

		const [row] = await dr
			.select({
				specificHazardLocalName: hazardousEventTable.specificHazardLocalName,
				specificHazardNationalName:
					hazardousEventTable.specificHazardNationalName,
			})
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, id));

		expect(row.specificHazardLocalName).toBeNull();
		expect(row.specificHazardNationalName).toBeNull();
	});

	it("allows an insert with both columns explicitly set to NULL", async () => {
		const id = await seedHazardousEventWithSpecificHazardNames({
			specificHazardLocalName: null,
			specificHazardNationalName: null,
		});

		const [row] = await dr
			.select({
				specificHazardLocalName: hazardousEventTable.specificHazardLocalName,
				specificHazardNationalName:
					hazardousEventTable.specificHazardNationalName,
			})
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, id));

		expect(row.specificHazardLocalName).toBeNull();
		expect(row.specificHazardNationalName).toBeNull();
	});

	it("allows an insert with specific_hazard_local_name set to a non-null string", async () => {
		const id = await seedHazardousEventWithSpecificHazardNames({
			specificHazardLocalName: "Local name",
		});

		const [row] = await dr
			.select({
				specificHazardLocalName: hazardousEventTable.specificHazardLocalName,
			})
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, id));

		expect(row.specificHazardLocalName).toBe("Local name");
	});

	it("allows an insert with specific_hazard_national_name set to a non-null string", async () => {
		const id = await seedHazardousEventWithSpecificHazardNames({
			specificHazardNationalName: "National name",
		});

		const [row] = await dr
			.select({
				specificHazardNationalName:
					hazardousEventTable.specificHazardNationalName,
			})
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, id));

		expect(row.specificHazardNationalName).toBe("National name");
	});

	it("allows an update setting specific_hazard_local_name to a non-null string", async () => {
		const id = await seedHazardousEventWithSpecificHazardNames();

		await dr
			.update(hazardousEventTable)
			.set({ specificHazardLocalName: "Updated local name" })
			.where(eq(hazardousEventTable.id, id));

		const [row] = await dr
			.select({
				specificHazardLocalName: hazardousEventTable.specificHazardLocalName,
			})
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, id));

		expect(row.specificHazardLocalName).toBe("Updated local name");
	});

	it("allows an update setting specific_hazard_national_name to a non-null string", async () => {
		const id = await seedHazardousEventWithSpecificHazardNames();

		await dr
			.update(hazardousEventTable)
			.set({ specificHazardNationalName: "Updated national name" })
			.where(eq(hazardousEventTable.id, id));

		const [row] = await dr
			.select({
				specificHazardNationalName:
					hazardousEventTable.specificHazardNationalName,
			})
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, id));

		expect(row.specificHazardNationalName).toBe("Updated national name");
	});

	describe("independence", () => {
		it("sets specific_hazard_local_name while specific_hazard_national_name stays NULL", async () => {
			const id = await seedHazardousEventWithSpecificHazardNames({
				specificHazardLocalName: "Only local",
			});

			const [row] = await dr
				.select({
					specificHazardLocalName: hazardousEventTable.specificHazardLocalName,
					specificHazardNationalName:
						hazardousEventTable.specificHazardNationalName,
				})
				.from(hazardousEventTable)
				.where(eq(hazardousEventTable.id, id));

			expect(row.specificHazardLocalName).toBe("Only local");
			expect(row.specificHazardNationalName).toBeNull();
		});

		it("sets specific_hazard_national_name while specific_hazard_local_name stays NULL", async () => {
			const id = await seedHazardousEventWithSpecificHazardNames({
				specificHazardNationalName: "Only national",
			});

			const [row] = await dr
				.select({
					specificHazardLocalName: hazardousEventTable.specificHazardLocalName,
					specificHazardNationalName:
						hazardousEventTable.specificHazardNationalName,
				})
				.from(hazardousEventTable)
				.where(eq(hazardousEventTable.id, id));

			expect(row.specificHazardLocalName).toBeNull();
			expect(row.specificHazardNationalName).toBe("Only national");
		});

		it("sets both columns to distinct non-null values on the same row", async () => {
			const id = await seedHazardousEventWithSpecificHazardNames({
				specificHazardLocalName: "Local value",
				specificHazardNationalName: "National value",
			});

			const [row] = await dr
				.select({
					specificHazardLocalName: hazardousEventTable.specificHazardLocalName,
					specificHazardNationalName:
						hazardousEventTable.specificHazardNationalName,
				})
				.from(hazardousEventTable)
				.where(eq(hazardousEventTable.id, id));

			expect(row.specificHazardLocalName).toBe("Local value");
			expect(row.specificHazardNationalName).toBe("National value");
		});
	});

	describe("concurrent access", () => {
		it("allows two concurrent inserts of different rows setting either column independently", async () => {
			const outcomes = await Promise.all([
				seedHazardousEventWithSpecificHazardNames({
					specificHazardLocalName: "Concurrent local",
				}).then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
				seedHazardousEventWithSpecificHazardNames({
					specificHazardNationalName: "Concurrent national",
				}).then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			]);

			expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
		});
	});
});
