import "../setup";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hazardTypeFieldDefinitionTable } from "~/domains/hazardous-events/infrastructure/hazardTypeFieldDefinitionTable";
import { hazardTypeCustomFieldDefinitionTable } from "~/domains/hazardous-events/infrastructure/hazardTypeCustomFieldDefinitionTable";
import { hazardousEventFieldValueTable } from "~/domains/hazardous-events/infrastructure/hazardousEventFieldValueTable";
import { hazardousEventCustomFieldValueTable } from "~/domains/hazardous-events/infrastructure/hazardousEventCustomFieldValueTable";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { seedHazardousEvent } from "../models/hazardousEventTestHelpers";
import {
	seedCountryAccount,
	seedFieldDefinitionDeps,
} from "../models/hazardTypeFieldDefinitionTestHelpers";

async function seedFieldDefinition() {
	const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();
	const [definition] = await dr
		.insert(hazardTypeFieldDefinitionTable)
		.values({
			hazardTypeId: hazardType.id,
			fieldKey: `field-${randomUUID()}`,
			label: "Field",
			dataType: dataType.id,
			required: true,
			unit: unit.id,
		})
		.returning();
	return definition;
}

async function seedCustomFieldDefinition() {
	const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();
	const account = await seedCountryAccount();
	const [definition] = await dr
		.insert(hazardTypeCustomFieldDefinitionTable)
		.values({
			countryAccountsId: account.id,
			hazardTypeId: hazardType.id,
			fieldKey: `custom-field-${randomUUID()}`,
			label: "Custom Field",
			dataType: dataType.id,
			required: false,
			unit: unit.id,
		})
		.returning();
	return definition;
}

describe("hazardousEventFieldValueTable", () => {
	it("inserts a field value under an existing event and definition", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();
		const definition = await seedFieldDefinition();

		const [row] = await dr
			.insert(hazardousEventFieldValueTable)
			.values({
				hazardousEventId,
				hazardTypeFieldDefinitionId: definition.id,
				value: "120",
			})
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.hazardousEventId).toBe(hazardousEventId);
		expect(row.hazardTypeFieldDefinitionId).toBe(definition.id);
		expect(row.value).toBe("120");
		expect(row.createdAt).toBeInstanceOf(Date);
		expect(row.updatedAt).toBeInstanceOf(Date);
	});

	it("rejects an insert with hazardousEventId = NULL", async () => {
		const definition = await seedFieldDefinition();

		await expect(
			dr.insert(hazardousEventFieldValueTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				hazardousEventId: null,
				hazardTypeFieldDefinitionId: definition.id,
				value: "120",
			}),
		).rejects.toThrow();
	});

	it("rejects an insert with hazardTypeFieldDefinitionId = NULL", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventFieldValueTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				hazardTypeFieldDefinitionId: null,
				hazardousEventId,
				value: "120",
			}),
		).rejects.toThrow();
	});

	it("rejects an insert with value = NULL", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();
		const definition = await seedFieldDefinition();

		await expect(
			dr.insert(hazardousEventFieldValueTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				value: null,
				hazardousEventId,
				hazardTypeFieldDefinitionId: definition.id,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose hazardousEventId matches no hazardous_event row", async () => {
		const definition = await seedFieldDefinition();

		await expect(
			dr.insert(hazardousEventFieldValueTable).values({
				hazardousEventId: randomUUID(),
				hazardTypeFieldDefinitionId: definition.id,
				value: "120",
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose hazardTypeFieldDefinitionId matches no field definition row", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventFieldValueTable).values({
				hazardousEventId,
				hazardTypeFieldDefinitionId: randomUUID(),
				value: "120",
			}),
		).rejects.toThrow();
	});

	it("allows an event to have values recorded for multiple field definitions", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();
		const definition1 = await seedFieldDefinition();
		const definition2 = await seedFieldDefinition();

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardousEventFieldValueTable)
				.values({
					hazardousEventId,
					hazardTypeFieldDefinitionId: definition1.id,
					value: "120",
				})
				.returning(),
			dr
				.insert(hazardousEventFieldValueTable)
				.values({
					hazardousEventId,
					hazardTypeFieldDefinitionId: definition2.id,
					value: "5.4",
				})
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("allows a field definition to have values recorded across multiple events", async () => {
		const { id: event1 } = await seedHazardousEvent();
		const { id: event2 } = await seedHazardousEvent();
		const definition = await seedFieldDefinition();

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardousEventFieldValueTable)
				.values({
					hazardousEventId: event1,
					hazardTypeFieldDefinitionId: definition.id,
					value: "120",
				})
				.returning(),
			dr
				.insert(hazardousEventFieldValueTable)
				.values({
					hazardousEventId: event2,
					hazardTypeFieldDefinitionId: definition.id,
					value: "130",
				})
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("rejects a duplicate (hazardousEventId, hazardTypeFieldDefinitionId) pair", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();
		const definition = await seedFieldDefinition();
		await dr.insert(hazardousEventFieldValueTable).values({
			hazardousEventId,
			hazardTypeFieldDefinitionId: definition.id,
			value: "120",
		});

		await expect(
			dr.insert(hazardousEventFieldValueTable).values({
				hazardousEventId,
				hazardTypeFieldDefinitionId: definition.id,
				value: "130",
			}),
		).rejects.toThrow();
	});

	it("allows two concurrent inserts of different definitions under the same event", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();
		const definition1 = await seedFieldDefinition();
		const definition2 = await seedFieldDefinition();

		const outcomes = await Promise.all([
			dr
				.insert(hazardousEventFieldValueTable)
				.values({
					hazardousEventId,
					hazardTypeFieldDefinitionId: definition1.id,
					value: "120",
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(hazardousEventFieldValueTable)
				.values({
					hazardousEventId,
					hazardTypeFieldDefinitionId: definition2.id,
					value: "5.4",
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});

	describe("cascade-delete behaviour", () => {
		it("deleting the referenced hazardous event cascades and removes the value row", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();
			const definition = await seedFieldDefinition();
			const [inserted] = await dr
				.insert(hazardousEventFieldValueTable)
				.values({
					hazardousEventId,
					hazardTypeFieldDefinitionId: definition.id,
					value: "120",
				})
				.returning({ id: hazardousEventFieldValueTable.id });

			await dr
				.delete(hazardousEventTable)
				.where(eq(hazardousEventTable.id, hazardousEventId));

			const remaining = await dr
				.select({ id: hazardousEventFieldValueTable.id })
				.from(hazardousEventFieldValueTable)
				.where(eq(hazardousEventFieldValueTable.id, inserted.id));

			expect(remaining).toHaveLength(0);
		});

		it("deleting the referenced field definition cascades and removes the value row", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();
			const definition = await seedFieldDefinition();
			const [inserted] = await dr
				.insert(hazardousEventFieldValueTable)
				.values({
					hazardousEventId,
					hazardTypeFieldDefinitionId: definition.id,
					value: "120",
				})
				.returning({ id: hazardousEventFieldValueTable.id });

			await dr
				.delete(hazardTypeFieldDefinitionTable)
				.where(eq(hazardTypeFieldDefinitionTable.id, definition.id));

			const remaining = await dr
				.select({ id: hazardousEventFieldValueTable.id })
				.from(hazardousEventFieldValueTable)
				.where(eq(hazardousEventFieldValueTable.id, inserted.id));

			expect(remaining).toHaveLength(0);
		});
	});
});

describe("hazardousEventCustomFieldValueTable", () => {
	it("inserts a custom field value under an existing event and custom definition", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();
		const definition = await seedCustomFieldDefinition();

		const [row] = await dr
			.insert(hazardousEventCustomFieldValueTable)
			.values({
				hazardousEventId,
				hazardTypeCustomFieldDefinitionId: definition.id,
				value: "42",
			})
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.hazardousEventId).toBe(hazardousEventId);
		expect(row.hazardTypeCustomFieldDefinitionId).toBe(definition.id);
		expect(row.value).toBe("42");
		expect(row.createdAt).toBeInstanceOf(Date);
		expect(row.updatedAt).toBeInstanceOf(Date);
	});

	it("rejects an insert with hazardousEventId = NULL", async () => {
		const definition = await seedCustomFieldDefinition();

		await expect(
			dr.insert(hazardousEventCustomFieldValueTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				hazardousEventId: null,
				hazardTypeCustomFieldDefinitionId: definition.id,
				value: "42",
			}),
		).rejects.toThrow();
	});

	it("rejects an insert with hazardTypeCustomFieldDefinitionId = NULL", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventCustomFieldValueTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				hazardTypeCustomFieldDefinitionId: null,
				hazardousEventId,
				value: "42",
			}),
		).rejects.toThrow();
	});

	it("rejects an insert with value = NULL", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();
		const definition = await seedCustomFieldDefinition();

		await expect(
			dr.insert(hazardousEventCustomFieldValueTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				value: null,
				hazardousEventId,
				hazardTypeCustomFieldDefinitionId: definition.id,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose hazardousEventId matches no hazardous_event row", async () => {
		const definition = await seedCustomFieldDefinition();

		await expect(
			dr.insert(hazardousEventCustomFieldValueTable).values({
				hazardousEventId: randomUUID(),
				hazardTypeCustomFieldDefinitionId: definition.id,
				value: "42",
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose hazardTypeCustomFieldDefinitionId matches no custom field definition row", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventCustomFieldValueTable).values({
				hazardousEventId,
				hazardTypeCustomFieldDefinitionId: randomUUID(),
				value: "42",
			}),
		).rejects.toThrow();
	});

	it("allows an event to have values recorded for multiple custom field definitions", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();
		const definition1 = await seedCustomFieldDefinition();
		const definition2 = await seedCustomFieldDefinition();

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardousEventCustomFieldValueTable)
				.values({
					hazardousEventId,
					hazardTypeCustomFieldDefinitionId: definition1.id,
					value: "42",
				})
				.returning(),
			dr
				.insert(hazardousEventCustomFieldValueTable)
				.values({
					hazardousEventId,
					hazardTypeCustomFieldDefinitionId: definition2.id,
					value: "99",
				})
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("allows a custom field definition to have values recorded across multiple events", async () => {
		const { id: event1 } = await seedHazardousEvent();
		const { id: event2 } = await seedHazardousEvent();
		const definition = await seedCustomFieldDefinition();

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardousEventCustomFieldValueTable)
				.values({
					hazardousEventId: event1,
					hazardTypeCustomFieldDefinitionId: definition.id,
					value: "42",
				})
				.returning(),
			dr
				.insert(hazardousEventCustomFieldValueTable)
				.values({
					hazardousEventId: event2,
					hazardTypeCustomFieldDefinitionId: definition.id,
					value: "43",
				})
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("rejects a duplicate (hazardousEventId, hazardTypeCustomFieldDefinitionId) pair", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();
		const definition = await seedCustomFieldDefinition();
		await dr.insert(hazardousEventCustomFieldValueTable).values({
			hazardousEventId,
			hazardTypeCustomFieldDefinitionId: definition.id,
			value: "42",
		});

		await expect(
			dr.insert(hazardousEventCustomFieldValueTable).values({
				hazardousEventId,
				hazardTypeCustomFieldDefinitionId: definition.id,
				value: "43",
			}),
		).rejects.toThrow();
	});

	it("allows two concurrent inserts of different custom field values under the same event", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();
		const definition1 = await seedCustomFieldDefinition();
		const definition2 = await seedCustomFieldDefinition();

		const outcomes = await Promise.all([
			dr
				.insert(hazardousEventCustomFieldValueTable)
				.values({
					hazardousEventId,
					hazardTypeCustomFieldDefinitionId: definition1.id,
					value: "42",
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(hazardousEventCustomFieldValueTable)
				.values({
					hazardousEventId,
					hazardTypeCustomFieldDefinitionId: definition2.id,
					value: "99",
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});

	describe("cascade-delete behaviour", () => {
		it("deleting the referenced hazardous event cascades and removes the custom value row", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();
			const definition = await seedCustomFieldDefinition();
			const [inserted] = await dr
				.insert(hazardousEventCustomFieldValueTable)
				.values({
					hazardousEventId,
					hazardTypeCustomFieldDefinitionId: definition.id,
					value: "42",
				})
				.returning({ id: hazardousEventCustomFieldValueTable.id });

			await dr
				.delete(hazardousEventTable)
				.where(eq(hazardousEventTable.id, hazardousEventId));

			const remaining = await dr
				.select({ id: hazardousEventCustomFieldValueTable.id })
				.from(hazardousEventCustomFieldValueTable)
				.where(eq(hazardousEventCustomFieldValueTable.id, inserted.id));

			expect(remaining).toHaveLength(0);
		});

		it("deleting the referenced custom field definition cascades and removes the custom value row", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();
			const definition = await seedCustomFieldDefinition();
			const [inserted] = await dr
				.insert(hazardousEventCustomFieldValueTable)
				.values({
					hazardousEventId,
					hazardTypeCustomFieldDefinitionId: definition.id,
					value: "42",
				})
				.returning({ id: hazardousEventCustomFieldValueTable.id });

			await dr
				.delete(hazardTypeCustomFieldDefinitionTable)
				.where(eq(hazardTypeCustomFieldDefinitionTable.id, definition.id));

			const remaining = await dr
				.select({ id: hazardousEventCustomFieldValueTable.id })
				.from(hazardousEventCustomFieldValueTable)
				.where(eq(hazardousEventCustomFieldValueTable.id, inserted.id));

			expect(remaining).toHaveLength(0);
		});
	});
});
