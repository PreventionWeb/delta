import { getAvailableLanguages } from "~/backend.server/translations";
import { dr } from "~/db.server";
import { InstanceSystemSettingRepository } from "~/db/queries/instanceSystemSettingRepository";
import { INSTANCE_NAME_MAX_LENGTH } from "~/frontend/systemSettingsAction";
import { configSupportedLanguages } from "~/utils/config";

export { INSTANCE_NAME_MAX_LENGTH };

export class SettingsValidationError extends Error {
	errors: Record<string, string>;

	constructor(errors: Record<string, string>) {
		super("Validation Error");
		this.errors = errors;
	}
}

export const SettingsService = {
	async updateSettings(
		countryAccountsId: string | null,
		instanceName: string,
		language: string,
	) {
		const errors: Record<string, string> = {};
		const trimmedName = (instanceName ?? "").trim();

		if (!countryAccountsId) {
			errors.countryAccountsId = "Country account context is required";
		}

		if (trimmedName.length === 0) {
			errors.instanceName = "Enter an instance name.";
		} else if (trimmedName.length > INSTANCE_NAME_MAX_LENGTH) {
			errors.instanceName = `Instance name must be ${INSTANCE_NAME_MAX_LENGTH} characters or fewer.`;
		}

		const allowedLanguages = configSupportedLanguages(getAvailableLanguages());
		if (!language || !allowedLanguages.includes(language)) {
			errors.language = "Select a supported language.";
		}

		if (Object.keys(errors).length > 0) {
			throw new SettingsValidationError(errors);
		}

		const tenantId = countryAccountsId as string;

		return dr.transaction(async (tx) => {
			const instanceSystemSettings =
				await InstanceSystemSettingRepository.updateByCountryAccountId(
					tenantId,
					{
						websiteName: trimmedName,
						language,
					},
					tx,
				);

			if (!instanceSystemSettings) {
				throw new Error("Instance system settings not found for tenant");
			}

			return { instanceSystemSettings };
		});
	},
};
