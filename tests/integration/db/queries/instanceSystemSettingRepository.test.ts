import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import {
	countryAccountsTable,
	instanceSystemSettingsTable,
} from "~/drizzle/schema";
import { countriesTable } from "../testSchema";
import { InstanceSystemSettingRepository } from "~/db/queries/instanceSystemSettingRepository";
import {
	INSTANCE_NAME_MAX_LENGTH,
	SettingsService,
	SettingsValidationError,
} from "~/services/settingsService";

describe("InstanceSystemSettingRepository & SettingsService", () => {
	const countryAId = crypto.randomUUID();
	const countryBId = crypto.randomUUID();
	const tenantAId = crypto.randomUUID();
	const tenantBId = crypto.randomUUID();
	const missingTenantId = crypto.randomUUID();

	beforeAll(async () => {
		await dr.insert(countriesTable).values([
			{ id: countryAId, name: "Settings Testland A" },
			{ id: countryBId, name: "Settings Testland B" },
		]);

		await dr.insert(countryAccountsTable).values([
			{
				id: tenantAId,
				shortDescription: "Settings Tenant A",
				countryId: countryAId,
				status: 1,
				type: "Official",
			},
			{
				id: tenantBId,
				shortDescription: "Settings Tenant B",
				countryId: countryBId,
				status: 1,
				type: "Official",
			},
		]);

		await dr.insert(instanceSystemSettingsTable).values([
			{
				countryAccountsId: tenantAId,
				websiteName: "Tenant A Initial",
				language: "en",
				currencyCode: "USD",
				dtsInstanceCtryIso3: "USA",
				totpIssuer: "DELTA A",
			},
			{
				countryAccountsId: tenantBId,
				websiteName: "Tenant B Initial",
				language: "fr",
				currencyCode: "HTG",
				dtsInstanceCtryIso3: "HTI",
				totpIssuer: "DELTA B",
			},
		]);
	});

	afterAll(async () => {
		await dr
			.delete(instanceSystemSettingsTable)
			.where(eq(instanceSystemSettingsTable.countryAccountsId, tenantAId));
		await dr
			.delete(instanceSystemSettingsTable)
			.where(eq(instanceSystemSettingsTable.countryAccountsId, tenantBId));
		await dr
			.delete(countryAccountsTable)
			.where(eq(countryAccountsTable.id, tenantAId));
		await dr
			.delete(countryAccountsTable)
			.where(eq(countryAccountsTable.id, tenantBId));
		await dr.delete(countriesTable).where(eq(countriesTable.id, countryAId));
		await dr.delete(countriesTable).where(eq(countriesTable.id, countryBId));
	});

	it("updateByCountryAccountId updates only the active tenant and returns null when missing", async () => {
		const updated =
			await InstanceSystemSettingRepository.updateByCountryAccountId(
				tenantAId,
				{
					websiteName: "DGPC Haiti",
					language: "fr",
				},
			);

		expect(updated?.websiteName).toBe("DGPC Haiti");
		expect(updated?.language).toBe("fr");

		const tenantB =
			await InstanceSystemSettingRepository.getByCountryAccountId(tenantBId);
		expect(tenantB?.websiteName).toBe("Tenant B Initial");
		expect(tenantB?.language).toBe("fr");

		const missing =
			await InstanceSystemSettingRepository.updateByCountryAccountId(
				missingTenantId,
				{ websiteName: "Should Not Exist" },
			);
		expect(missing).toBeNull();
	});

	it("SettingsService.updateSettings validates empty, >50 char instanceName, and unsupported language", async () => {
		expect(INSTANCE_NAME_MAX_LENGTH).toBe(50);

		await expect(
			SettingsService.updateSettings(tenantAId, "   ", "en"),
		).rejects.toThrow(SettingsValidationError);

		const tooLong = "A".repeat(51);
		try {
			await SettingsService.updateSettings(tenantAId, tooLong, "en");
			expect.unreachable("Should have thrown SettingsValidationError");
		} catch (err) {
			expect(err).toBeInstanceOf(SettingsValidationError);
			expect((err as SettingsValidationError).errors.instanceName).toBeTruthy();
		}

		try {
			await SettingsService.updateSettings(
				tenantAId,
				"Valid Name",
				"xx-invalid",
			);
			expect.unreachable("Should have thrown SettingsValidationError");
		} catch (err) {
			expect(err).toBeInstanceOf(SettingsValidationError);
			expect((err as SettingsValidationError).errors.language).toBeTruthy();
		}
	});

	it("SettingsService.updateSettings trims instanceName, allows 50 chars, and isolates tenants", async () => {
		const fiftyChars = "B".repeat(50);
		const result = await SettingsService.updateSettings(
			tenantAId,
			`  ${fiftyChars}  `,
			"en",
		);

		expect(result.instanceSystemSettings?.websiteName).toBe(fiftyChars);
		expect(result.instanceSystemSettings?.language).toBe("en");

		const tenantB =
			await InstanceSystemSettingRepository.getByCountryAccountId(tenantBId);
		expect(tenantB?.websiteName).toBe("Tenant B Initial");
	});
});
