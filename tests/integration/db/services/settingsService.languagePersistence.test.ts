import "../setup";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dr } from "~/db.server";
import { countriesTable } from "../testSchema/countriesTable";
import { countryAccounts } from "../testSchema/countryAccounts";
import { instanceSystemSettingsTable } from "../testSchema/instanceSystemSettingsTable";
import {
	SettingsService,
	SettingsValidationError,
} from "~/services/settingsService";
import { InstanceSystemSettingRepository } from "~/db/queries/instanceSystemSettingRepository";
import { getAvailableLanguages } from "~/backend.server/translations";

/** Helper: insert a countries + country_accounts row and return tenant id. */
async function insertCountryAccount(): Promise<string> {
	const [country] = await dr
		.insert(countriesTable)
		.values({ name: `Albania test ${crypto.randomUUID().slice(0, 8)}` })
		.returning({ id: countriesTable.id });

	const [account] = await dr
		.insert(countryAccounts)
		.values({ shortDescription: "ALB", countryId: country.id })
		.returning({ id: countryAccounts.id });

	return account.id;
}

describe("Albanian language selection persistence", () => {
	it("exposes Albanian (sq) as a selectable language option", () => {
		const languages = getAvailableLanguages();

		expect(languages).toContain("sq");
	});

	it("persists the Albanian language selection to the instance settings row and it survives re-reads", async () => {
		const countryAccountsId = await insertCountryAccount();

		const created = await InstanceSystemSettingRepository.create({
			countryAccountsId,
			websiteName: "Albania DELTA",
		});
		expect(created).not.toBeNull();
		expect(created!.countryAccountsId).toBe(countryAccountsId);
		expect(created!.language).toBe("en"); // default before selecting Albanian

		const { instanceSystemSettings } = await SettingsService.updateSettings(
			created!.id,
			"Albania DELTA",
			"sq",
		);
		expect(instanceSystemSettings?.language).toBe("sq");

		// The login flow reads settings by tenant id — the selection must still
		// be there after the write (i.e. it persisted, not just echoed back).
		const fromDb =
			await InstanceSystemSettingRepository.getByCountryAccountId(
				countryAccountsId,
			);
		expect(fromDb?.language).toBe("sq");

		const direct = await dr
			.select({ language: instanceSystemSettingsTable.language })
			.from(instanceSystemSettingsTable)
			.where(eq(instanceSystemSettingsTable.id, created!.id));
		expect(direct).toHaveLength(1);
		expect(direct[0].language).toBe("sq");
	});

	it("keeps a previously persisted Albanian selection when unrelated settings are updated", async () => {
		const countryAccountsId = await insertCountryAccount();

		const created = await InstanceSystemSettingRepository.create({
			countryAccountsId,
			websiteName: "Albania DELTA",
			language: "sq",
		});

		await SettingsService.updateSettings(
			created!.id,
			"Albania DELTA renamed",
			"sq",
		);

		const fromDb =
			await InstanceSystemSettingRepository.getByCountryAccountId(
				countryAccountsId,
			);
		expect(fromDb?.websiteName).toBe("Albania DELTA renamed");
		expect(fromDb?.language).toBe("sq");
	});

	it("rejects an unsupported language so only a supported Albanian selection can be persisted", async () => {
		const countryAccountsId = await insertCountryAccount();
		const created = await InstanceSystemSettingRepository.create({
			countryAccountsId,
			websiteName: "Albania DELTA",
		});

		await expect(
			SettingsService.updateSettings(created!.id, "Albania DELTA", "xx"),
		).rejects.toBeInstanceOf(SettingsValidationError);

		const fromDb =
			await InstanceSystemSettingRepository.getByCountryAccountId(
				countryAccountsId,
			);
		expect(fromDb?.language).toBe("en");
	});
});
