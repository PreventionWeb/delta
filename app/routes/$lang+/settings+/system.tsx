import type { MetaFunction } from "react-router";
import { BackendContext } from "~/backend.server/context";
import { getAvailableLanguages } from "~/backend.server/translations";
import { CountryRepository } from "~/db/queries/countriesRepository";
import { CountryAccountsRepository } from "~/db/queries/countryAccountsRepository";
import { getSystemInfo } from "~/db/queries/dtsSystemInfo";
import { InstanceSystemSettingRepository } from "~/db/queries/instanceSystemSettingRepository";
import { ViewContext } from "~/frontend/context";
import type { SystemSettingsActionResult } from "~/frontend/systemSettingsAction";
import SystemSettingsPage from "~/pages/SystemSettingsPage";
import {
	SettingsService,
	SettingsValidationError,
} from "~/services/settingsService";
import { authActionWithPerm, authLoaderWithPerm } from "~/utils/auth";
import {
	configApplicationEmail,
	configPublicUrl,
	configSupportedLanguages,
} from "~/utils/config";
import { htmlTitle } from "~/utils/htmlmeta";
import {
	getCountryAccountsIdFromSession,
	getUserRoleFromSession,
} from "~/utils/session";

export const handle = { useDesignSystemCanvas: true };

export const loader = authLoaderWithPerm(
	"ManageCountrySettings",
	async (loaderArgs) => {
		const { request } = loaderArgs;
		const countryAccountsId = await getCountryAccountsIdFromSession(request);

		const settings =
			await InstanceSystemSettingRepository.getByCountryAccountId(
				countryAccountsId,
			);
		const countryAccount =
			await CountryAccountsRepository.getById(countryAccountsId);
		const country = countryAccount
			? await CountryRepository.getById(countryAccount.countryId)
			: null;
		const dtsSystemInfo = await getSystemInfo();

		const currencies: string[] = [];
		if (settings) {
			currencies.push(settings.currencyCode);
		}

		const confEmailObj = configApplicationEmail();
		const userRole = await getUserRoleFromSession(request);

		return {
			publicURL: configPublicUrl(),
			currencyArray: currencies,
			availableLanguages: configSupportedLanguages(getAvailableLanguages()),
			systemLanguage: settings?.language,
			confEmailObj,
			instanceSystemSettings: settings,
			dtsSystemInfo,
			country,
			userRole: userRole || "",
			countryAccountType: countryAccount?.type,
		};
	},
);

export const action = authActionWithPerm(
	"ManageCountrySettings",
	async (actionArgs) => {
		const ctx = new BackendContext(actionArgs);
		const { request } = actionArgs;
		const countryAccountsId = await getCountryAccountsIdFromSession(request);
		const formData = await request.formData();
		const instanceName = String(formData.get("instanceName") ?? "");
		const language = String(formData.get("language") ?? "");

		try {
			await SettingsService.updateSettings(
				countryAccountsId,
				instanceName,
				language,
			);
			return Response.json({
				ok: true,
			} satisfies SystemSettingsActionResult);
		} catch (error) {
			if (error instanceof SettingsValidationError) {
				return Response.json(
					{
						ok: false,
						fieldErrors: error.errors,
					} satisfies SystemSettingsActionResult,
					{ status: 400 },
				);
			}
			console.error("System settings update failed:", error);
			return Response.json(
				{
					ok: false,
					error: ctx.t({
						code: "settings.system.save_failed",
						msg: "Could not save settings. Please try again.",
					}),
				} satisfies SystemSettingsActionResult,
				{ status: 500 },
			);
		}
	},
);

export const meta: MetaFunction = ({ params }) => {
	const ctx = new ViewContext({ lang: params.lang || "en" });

	return [
		{
			title: htmlTitle(
				ctx,
				ctx.t({
					code: "meta.system_settings",
					msg: "System settings",
				}),
			),
		},
		{
			name: "description",
			content: ctx.t({
				code: "settings.system.subtitle",
				msg: "How this instance of DELTA Resilience is set up.",
			}),
		},
	];
};

export default function Settings() {
	return <SystemSettingsPage />;
}
