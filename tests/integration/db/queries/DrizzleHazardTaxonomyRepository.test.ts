import "../setup";
import { randomUUID } from "crypto";
import { describe, it, expect, vi } from "vitest";
import { dr } from "~/db.server";
import { hazardDriverTable } from "~/domains/hazardous-events/infrastructure/hazardDriverTable";
import { hazardTypeCustomFieldDefinitionTable } from "~/domains/hazardous-events/infrastructure/hazardTypeCustomFieldDefinitionTable";
import { DrizzleHazardTaxonomyRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardTaxonomyRepository.server";
import { seedCountryAccount } from "../models/hazardousEventTestHelpers";
import {
	seedHazardType,
	seedFieldDataType,
	seedFieldUnit,
} from "../models/hazardTypeFieldDefinitionTestHelpers";

async function seedHazardDriver(countryAccountsId: string) {
	const [row] = await dr
		.insert(hazardDriverTable)
		.values({ name: `Driver ${randomUUID()}`, countryAccountsId })
		.returning();
	return row;
}

async function seedCustomFieldDefinition(countryAccountsId: string) {
	const [hazardType, dataType, unit] = await Promise.all([
		seedHazardType(),
		seedFieldDataType(),
		seedFieldUnit(),
	]);
	const [row] = await dr
		.insert(hazardTypeCustomFieldDefinitionTable)
		.values({
			countryAccountsId,
			hazardTypeId: hazardType.id,
			fieldKey: `field-${randomUUID()}`,
			label: "Test Field",
			dataType: dataType.id,
			required: false,
			unit: unit.id,
		})
		.returning();
	return row;
}

describe("DrizzleHazardTaxonomyRepository", () => {
	describe("findValidHazardDriverIds", () => {
		it("includes a same-tenant id and excludes a cross-tenant one", async () => {
			const tenantA = (await seedCountryAccount()) as string;
			const tenantB = (await seedCountryAccount()) as string;
			const driverA = await seedHazardDriver(tenantA);
			const driverB = await seedHazardDriver(tenantB);
			const repo = new DrizzleHazardTaxonomyRepository(dr);

			const result = await repo.findValidHazardDriverIds(
				[driverA.id, driverB.id],
				tenantA,
			);

			expect(result.has(driverA.id)).toBe(true);
			expect(result.has(driverB.id)).toBe(false);
		});

		it("excludes a non-existent id without throwing", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const repo = new DrizzleHazardTaxonomyRepository(dr);

			await expect(
				repo.findValidHazardDriverIds([randomUUID()], tenantId),
			).resolves.toEqual(new Set());
		});

		it("resolves an empty set for an empty ids array without issuing a query", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const repo = new DrizzleHazardTaxonomyRepository(dr);
			const selectSpy = vi.spyOn(dr, "select");

			await expect(
				repo.findValidHazardDriverIds([], tenantId),
			).resolves.toEqual(new Set());
			expect(selectSpy).not.toHaveBeenCalled();

			selectSpy.mockRestore();
		});
	});

	describe("findValidCustomFieldDefinitionIds", () => {
		it("includes a same-tenant id and excludes a cross-tenant one", async () => {
			const tenantA = (await seedCountryAccount()) as string;
			const tenantB = (await seedCountryAccount()) as string;
			const fieldA = await seedCustomFieldDefinition(tenantA);
			const fieldB = await seedCustomFieldDefinition(tenantB);
			const repo = new DrizzleHazardTaxonomyRepository(dr);

			const result = await repo.findValidCustomFieldDefinitionIds(
				[fieldA.id, fieldB.id],
				tenantA,
			);

			expect(result.has(fieldA.id)).toBe(true);
			expect(result.has(fieldB.id)).toBe(false);
		});

		it("excludes a non-existent id without throwing", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const repo = new DrizzleHazardTaxonomyRepository(dr);

			await expect(
				repo.findValidCustomFieldDefinitionIds([randomUUID()], tenantId),
			).resolves.toEqual(new Set());
		});

		it("resolves an empty set for an empty ids array without issuing a query", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const repo = new DrizzleHazardTaxonomyRepository(dr);
			const selectSpy = vi.spyOn(dr, "select");

			await expect(
				repo.findValidCustomFieldDefinitionIds([], tenantId),
			).resolves.toEqual(new Set());
			expect(selectSpy).not.toHaveBeenCalled();

			selectSpy.mockRestore();
		});
	});
});

describe("DrizzleHazardTaxonomyRepository with tx (ca-he-csv-migration NOD-12)", () => {
	it("reads inside an open transaction without waiting on another connection", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const repo = new DrizzleHazardTaxonomyRepository(dr);

		const result = await dr.transaction(async (tx) => {
			const driver = await tx
				.insert(hazardDriverTable)
				.values({ name: `Driver ${randomUUID()}`, countryAccountsId: tenantId })
				.returning();
			const empty = await repo.findValidHazardDriverIds([], tenantId, tx);
			const seen = await repo.findValidHazardDriverIds(
				[driver[0].id],
				tenantId,
				tx,
			);
			const customFields = await repo.findValidCustomFieldDefinitionIds(
				[randomUUID()],
				tenantId,
				tx,
			);
			return { empty, seen, driverId: driver[0].id, customFields };
		});

		expect(result.empty.size).toBe(0);
		expect([...result.seen]).toEqual([result.driverId]);
		expect(result.customFields.size).toBe(0);
	});

	it("concurrent calls without tx resolve the same tenant-scoped set", async () => {
		const tenantId = (await seedCountryAccount()) as string;
		const driver = await seedHazardDriver(tenantId);
		const repo = new DrizzleHazardTaxonomyRepository(dr);

		const [first, second] = await Promise.all([
			repo.findValidHazardDriverIds([driver.id], tenantId),
			repo.findValidHazardDriverIds([driver.id], tenantId),
		]);

		expect([...first]).toEqual([driver.id]);
		expect([...second]).toEqual([driver.id]);
	});
});
