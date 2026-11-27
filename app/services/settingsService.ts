import { getAvailableLanguages } from "~/backend.server/translations";
import { dr } from "~/db.server";
import { InstanceSystemSettingRepository } from "~/db/queries/instanceSystemSettingRepository";

export class SettingsValidationError extends Error {
	errors: Record<string, string>;

	constructor(errors: Record<string, string>) {
		super("Validation Error");
		this.errors = errors;
	}
}

export const SettingsService = {
	async updateSettings(
		id: string | null,
		// privacyUrl: string | null,
		// termsUrl: string | null,
		// websiteLogoUrl: string,
		instanceName: string,
		// isApprovedRecordsPublic: boolean,
		// totpIssuer: string,
		language: string,
		countryAccountsId: string,
	) {
		const errors: Record<string, string> = {};

		if (!id) {
			errors.id = "Instance system settings Id is required";
		}

		if (!countryAccountsId) {
			errors.countryAccountsId = "Country account Id is required";
		}

		if (!instanceName || instanceName.trim().length === 0) {
			errors.instanceName = "Instance name is required";
		}

		if (!language || !getAvailableLanguages().includes(language)) {
			errors.language = "Language is required and must be supported";
		}

		if (Object.keys(errors).length > 0) {
			throw new SettingsValidationError(errors);
		}

		// id is guaranteed to be non-null after validation
		const idNonNull = id as string;

		return dr.transaction(async (tx) => {
			const instanceSystemSettings =
				await InstanceSystemSettingRepository.update(
					idNonNull,
					{
						websiteName: instanceName,
						language,
					},
					tx,
					countryAccountsId,
				);

			if (!instanceSystemSettings) {
				throw new SettingsValidationError({
					id: "Instance system settings not found for this country account",
				});
			}

			return { instanceSystemSettings };
		});
	},
};
