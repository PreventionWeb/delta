import "../setup";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { fieldDataTypeTable } from "~/domains/hazardous-events/infrastructure/fieldDataTypeTable";
import { fieldUnitTable } from "~/domains/hazardous-events/infrastructure/fieldUnitTable";
import { hazardTypeFieldDefinitionTable } from "~/domains/hazardous-events/infrastructure/hazardTypeFieldDefinitionTable";
import { hazardTypeCustomFieldDefinitionTable } from "~/domains/hazardous-events/infrastructure/hazardTypeCustomFieldDefinitionTable";
import { hazardTypeTable } from "../testSchema/hazardTypeTable";
import { countryAccounts } from "../testSchema/countryAccounts";
import {
	seedHazardType,
	seedCountryAccount,
	seedFieldDefinitionDeps,
} from "../models/hazardTypeFieldDefinitionTestHelpers";

describe("fieldDataTypeTable", () => {
	it("inserts a row with a new type", async () => {
		const [row] = await dr
			.insert(fieldDataTypeTable)
			.values({ type: `type-${randomUUID()}` })
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.type).toContain("type-");
	});

	it("rejects an insert with type = NULL", async () => {
		await expect(
			dr.insert(fieldDataTypeTable).values({
				// @ts-expect-error - type is required; verifying the not-null constraint
				type: null,
			}),
		).rejects.toThrow();
	});

	it("rejects a duplicate type", async () => {
		const type = `type-${randomUUID()}`;
		await dr.insert(fieldDataTypeTable).values({ type });

		await expect(
			dr.insert(fieldDataTypeTable).values({ type }),
		).rejects.toThrow();
	});

	it("allows two concurrent inserts of different types", async () => {
		const outcomes = await Promise.all([
			dr
				.insert(fieldDataTypeTable)
				.values({ type: `type-${randomUUID()}` })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(fieldDataTypeTable)
				.values({ type: `type-${randomUUID()}` })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});
});

describe("fieldUnitTable", () => {
	it("inserts a row with a new unit", async () => {
		const [row] = await dr
			.insert(fieldUnitTable)
			.values({ unit: `unit-${randomUUID()}` })
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.unit).toContain("unit-");
	});

	it("rejects an insert with unit = NULL", async () => {
		await expect(
			dr.insert(fieldUnitTable).values({
				// @ts-expect-error - unit is required; verifying the not-null constraint
				unit: null,
			}),
		).rejects.toThrow();
	});

	it("rejects a duplicate unit", async () => {
		const unit = `unit-${randomUUID()}`;
		await dr.insert(fieldUnitTable).values({ unit });

		await expect(dr.insert(fieldUnitTable).values({ unit })).rejects.toThrow();
	});

	it("allows two concurrent inserts of different units", async () => {
		const outcomes = await Promise.all([
			dr
				.insert(fieldUnitTable)
				.values({ unit: `unit-${randomUUID()}` })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(fieldUnitTable)
				.values({ unit: `unit-${randomUUID()}` })
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});
});

describe("hazardTypeFieldDefinitionTable", () => {
	it("inserts a field definition under an existing hazard type", async () => {
		const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();

		const [row] = await dr
			.insert(hazardTypeFieldDefinitionTable)
			.values({
				hazardTypeId: hazardType.id,
				fieldKey: "wind_speed",
				label: "Wind Speed",
				dataType: dataType.id,
				required: true,
				unit: unit.id,
			})
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.hazardTypeId).toBe(hazardType.id);
		expect(row.fieldKey).toBe("wind_speed");
		expect(row.label).toBe("Wind Speed");
		expect(row.dataType).toBe(dataType.id);
		expect(row.required).toBe(true);
		expect(row.unit).toBe(unit.id);
		expect(row.createdAt).toBeInstanceOf(Date);
		expect(row.updatedAt).toBeInstanceOf(Date);
	});

	it("rejects an insert with hazardTypeId = NULL", async () => {
		const { dataType, unit } = await seedFieldDefinitionDeps();

		await expect(
			dr.insert(hazardTypeFieldDefinitionTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				hazardTypeId: null,
				fieldKey: "wind_speed",
				label: "Wind Speed",
				dataType: dataType.id,
				required: true,
				unit: unit.id,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert with fieldKey = NULL", async () => {
		const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();

		await expect(
			dr.insert(hazardTypeFieldDefinitionTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				fieldKey: null,
				hazardTypeId: hazardType.id,
				label: "Wind Speed",
				dataType: dataType.id,
				required: true,
				unit: unit.id,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert with label = NULL", async () => {
		const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();

		await expect(
			dr.insert(hazardTypeFieldDefinitionTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				label: null,
				hazardTypeId: hazardType.id,
				fieldKey: "wind_speed",
				dataType: dataType.id,
				required: true,
				unit: unit.id,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert with dataType = NULL", async () => {
		const { hazardType, unit } = await seedFieldDefinitionDeps();

		await expect(
			dr.insert(hazardTypeFieldDefinitionTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				dataType: null,
				hazardTypeId: hazardType.id,
				fieldKey: "wind_speed",
				label: "Wind Speed",
				required: true,
				unit: unit.id,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert with required = NULL", async () => {
		const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();

		await expect(
			dr.insert(hazardTypeFieldDefinitionTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				required: null,
				hazardTypeId: hazardType.id,
				fieldKey: "wind_speed",
				label: "Wind Speed",
				dataType: dataType.id,
				unit: unit.id,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert with unit = NULL", async () => {
		const { hazardType, dataType } = await seedFieldDefinitionDeps();

		await expect(
			dr.insert(hazardTypeFieldDefinitionTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				unit: null,
				hazardTypeId: hazardType.id,
				fieldKey: "wind_speed",
				label: "Wind Speed",
				dataType: dataType.id,
				required: true,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose hazardTypeId matches no hazard_type row", async () => {
		const { dataType, unit } = await seedFieldDefinitionDeps();

		await expect(
			dr.insert(hazardTypeFieldDefinitionTable).values({
				hazardTypeId: randomUUID(),
				fieldKey: "wind_speed",
				label: "Wind Speed",
				dataType: dataType.id,
				required: true,
				unit: unit.id,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose dataType matches no field_data_type row", async () => {
		const { hazardType, unit } = await seedFieldDefinitionDeps();

		await expect(
			dr.insert(hazardTypeFieldDefinitionTable).values({
				hazardTypeId: hazardType.id,
				fieldKey: "wind_speed",
				label: "Wind Speed",
				dataType: randomUUID(),
				required: true,
				unit: unit.id,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose unit matches no field_unit row", async () => {
		const { hazardType, dataType } = await seedFieldDefinitionDeps();

		await expect(
			dr.insert(hazardTypeFieldDefinitionTable).values({
				hazardTypeId: hazardType.id,
				fieldKey: "wind_speed",
				label: "Wind Speed",
				dataType: dataType.id,
				required: true,
				unit: randomUUID(),
			}),
		).rejects.toThrow();
	});

	it("allows the same field key under two different hazard types", async () => {
		const {
			hazardType: hazardType1,
			dataType,
			unit,
		} = await seedFieldDefinitionDeps();
		const hazardType2 = await seedHazardType();

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardTypeFieldDefinitionTable)
				.values({
					hazardTypeId: hazardType1.id,
					fieldKey: "wind_speed",
					label: "Wind Speed",
					dataType: dataType.id,
					required: true,
					unit: unit.id,
				})
				.returning(),
			dr
				.insert(hazardTypeFieldDefinitionTable)
				.values({
					hazardTypeId: hazardType2.id,
					fieldKey: "wind_speed",
					label: "Wind Speed",
					dataType: dataType.id,
					required: true,
					unit: unit.id,
				})
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("rejects a duplicate (hazardTypeId, fieldKey) pair", async () => {
		const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();
		await dr.insert(hazardTypeFieldDefinitionTable).values({
			hazardTypeId: hazardType.id,
			fieldKey: "wind_speed",
			label: "Wind Speed",
			dataType: dataType.id,
			required: true,
			unit: unit.id,
		});

		await expect(
			dr.insert(hazardTypeFieldDefinitionTable).values({
				hazardTypeId: hazardType.id,
				fieldKey: "wind_speed",
				label: "Wind Speed (dup)",
				dataType: dataType.id,
				required: false,
				unit: unit.id,
			}),
		).rejects.toThrow();
	});

	it("allows two concurrent inserts of different field keys under the same hazard type", async () => {
		const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();

		const outcomes = await Promise.all([
			dr
				.insert(hazardTypeFieldDefinitionTable)
				.values({
					hazardTypeId: hazardType.id,
					fieldKey: "wind_speed",
					label: "Wind Speed",
					dataType: dataType.id,
					required: true,
					unit: unit.id,
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(hazardTypeFieldDefinitionTable)
				.values({
					hazardTypeId: hazardType.id,
					fieldKey: "magnitude",
					label: "Magnitude",
					dataType: dataType.id,
					required: true,
					unit: unit.id,
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});

	describe("restrict-delete behaviour", () => {
		it("rejects deleting a hazard type still referenced by a field definition row", async () => {
			const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();
			await dr.insert(hazardTypeFieldDefinitionTable).values({
				hazardTypeId: hazardType.id,
				fieldKey: "wind_speed",
				label: "Wind Speed",
				dataType: dataType.id,
				required: true,
				unit: unit.id,
			});

			await expect(
				dr.delete(hazardTypeTable).where(eq(hazardTypeTable.id, hazardType.id)),
			).rejects.toThrow();
		});

		it("rejects deleting a field data type still referenced by a field definition row", async () => {
			const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();
			await dr.insert(hazardTypeFieldDefinitionTable).values({
				hazardTypeId: hazardType.id,
				fieldKey: "wind_speed",
				label: "Wind Speed",
				dataType: dataType.id,
				required: true,
				unit: unit.id,
			});

			await expect(
				dr
					.delete(fieldDataTypeTable)
					.where(eq(fieldDataTypeTable.id, dataType.id)),
			).rejects.toThrow();
		});

		it("rejects deleting a field unit still referenced by a field definition row", async () => {
			const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();
			await dr.insert(hazardTypeFieldDefinitionTable).values({
				hazardTypeId: hazardType.id,
				fieldKey: "wind_speed",
				label: "Wind Speed",
				dataType: dataType.id,
				required: true,
				unit: unit.id,
			});

			await expect(
				dr.delete(fieldUnitTable).where(eq(fieldUnitTable.id, unit.id)),
			).rejects.toThrow();
		});
	});
});

describe("hazardTypeCustomFieldDefinitionTable", () => {
	it("inserts a custom field definition for a tenant", async () => {
		const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();
		const account = await seedCountryAccount();

		const [row] = await dr
			.insert(hazardTypeCustomFieldDefinitionTable)
			.values({
				countryAccountsId: account.id,
				hazardTypeId: hazardType.id,
				fieldKey: "custom_pressure",
				label: "Custom Pressure",
				dataType: dataType.id,
				required: false,
				unit: unit.id,
			})
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.countryAccountsId).toBe(account.id);
		expect(row.hazardTypeId).toBe(hazardType.id);
		expect(row.fieldKey).toBe("custom_pressure");
		expect(row.createdAt).toBeInstanceOf(Date);
		expect(row.updatedAt).toBeInstanceOf(Date);
	});

	it("rejects an insert with countryAccountsId = NULL", async () => {
		const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();

		await expect(
			dr.insert(hazardTypeCustomFieldDefinitionTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				countryAccountsId: null,
				hazardTypeId: hazardType.id,
				fieldKey: "custom_pressure",
				label: "Custom Pressure",
				dataType: dataType.id,
				required: false,
				unit: unit.id,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose countryAccountsId matches no country_accounts row", async () => {
		const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();

		await expect(
			dr.insert(hazardTypeCustomFieldDefinitionTable).values({
				countryAccountsId: randomUUID(),
				hazardTypeId: hazardType.id,
				fieldKey: "custom_pressure",
				label: "Custom Pressure",
				dataType: dataType.id,
				required: false,
				unit: unit.id,
			}),
		).rejects.toThrow();
	});

	it("allows the same field key to be reused by different tenants for the same hazard type", async () => {
		const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();
		const [account1, account2] = await Promise.all([
			seedCountryAccount(),
			seedCountryAccount(),
		]);

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardTypeCustomFieldDefinitionTable)
				.values({
					countryAccountsId: account1.id,
					hazardTypeId: hazardType.id,
					fieldKey: "custom_pressure",
					label: "Custom Pressure",
					dataType: dataType.id,
					required: false,
					unit: unit.id,
				})
				.returning(),
			dr
				.insert(hazardTypeCustomFieldDefinitionTable)
				.values({
					countryAccountsId: account2.id,
					hazardTypeId: hazardType.id,
					fieldKey: "custom_pressure",
					label: "Custom Pressure",
					dataType: dataType.id,
					required: false,
					unit: unit.id,
				})
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("allows the same tenant to define the same field key under different hazard types", async () => {
		const {
			hazardType: hazardType1,
			dataType,
			unit,
		} = await seedFieldDefinitionDeps();
		const hazardType2 = await seedHazardType();
		const account = await seedCountryAccount();

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardTypeCustomFieldDefinitionTable)
				.values({
					countryAccountsId: account.id,
					hazardTypeId: hazardType1.id,
					fieldKey: "custom_pressure",
					label: "Custom Pressure",
					dataType: dataType.id,
					required: false,
					unit: unit.id,
				})
				.returning(),
			dr
				.insert(hazardTypeCustomFieldDefinitionTable)
				.values({
					countryAccountsId: account.id,
					hazardTypeId: hazardType2.id,
					fieldKey: "custom_pressure",
					label: "Custom Pressure",
					dataType: dataType.id,
					required: false,
					unit: unit.id,
				})
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("rejects a duplicate (countryAccountsId, hazardTypeId, fieldKey) triple", async () => {
		const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();
		const account = await seedCountryAccount();
		await dr.insert(hazardTypeCustomFieldDefinitionTable).values({
			countryAccountsId: account.id,
			hazardTypeId: hazardType.id,
			fieldKey: "custom_pressure",
			label: "Custom Pressure",
			dataType: dataType.id,
			required: false,
			unit: unit.id,
		});

		await expect(
			dr.insert(hazardTypeCustomFieldDefinitionTable).values({
				countryAccountsId: account.id,
				hazardTypeId: hazardType.id,
				fieldKey: "custom_pressure",
				label: "Custom Pressure (dup)",
				dataType: dataType.id,
				required: true,
				unit: unit.id,
			}),
		).rejects.toThrow();
	});

	it("allows two concurrent inserts of different custom field keys for the same tenant and hazard type", async () => {
		const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();
		const account = await seedCountryAccount();

		const outcomes = await Promise.all([
			dr
				.insert(hazardTypeCustomFieldDefinitionTable)
				.values({
					countryAccountsId: account.id,
					hazardTypeId: hazardType.id,
					fieldKey: "custom_pressure",
					label: "Custom Pressure",
					dataType: dataType.id,
					required: false,
					unit: unit.id,
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(hazardTypeCustomFieldDefinitionTable)
				.values({
					countryAccountsId: account.id,
					hazardTypeId: hazardType.id,
					fieldKey: "custom_humidity",
					label: "Custom Humidity",
					dataType: dataType.id,
					required: false,
					unit: unit.id,
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});

	describe("cascade/restrict behaviour", () => {
		it("deleting the referenced tenant cascades and removes the custom field definition row", async () => {
			const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();
			const account = await seedCountryAccount();
			const [inserted] = await dr
				.insert(hazardTypeCustomFieldDefinitionTable)
				.values({
					countryAccountsId: account.id,
					hazardTypeId: hazardType.id,
					fieldKey: "custom_pressure",
					label: "Custom Pressure",
					dataType: dataType.id,
					required: false,
					unit: unit.id,
				})
				.returning({ id: hazardTypeCustomFieldDefinitionTable.id });

			await dr
				.delete(countryAccounts)
				.where(eq(countryAccounts.id, account.id));

			const remaining = await dr
				.select({ id: hazardTypeCustomFieldDefinitionTable.id })
				.from(hazardTypeCustomFieldDefinitionTable)
				.where(eq(hazardTypeCustomFieldDefinitionTable.id, inserted.id));

			expect(remaining).toHaveLength(0);
		});

		it("rejects deleting a hazard type still referenced by a custom field definition row", async () => {
			const { hazardType, dataType, unit } = await seedFieldDefinitionDeps();
			const account = await seedCountryAccount();
			await dr.insert(hazardTypeCustomFieldDefinitionTable).values({
				countryAccountsId: account.id,
				hazardTypeId: hazardType.id,
				fieldKey: "custom_pressure",
				label: "Custom Pressure",
				dataType: dataType.id,
				required: false,
				unit: unit.id,
			});

			await expect(
				dr.delete(hazardTypeTable).where(eq(hazardTypeTable.id, hazardType.id)),
			).rejects.toThrow();
		});
	});
});
