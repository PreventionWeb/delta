import { and, eq } from "drizzle-orm";
import {
	SelectInstanceSystemSettings,
	InsertInstanceSystemSettings,
	instanceSystemSettingsTable,
} from "~/drizzle/schema/instanceSystemSettingsTable";
import { dr, Tx } from "~/db.server";

export const InstanceSystemSettingRepository = {
	getByCountryAccountId: async (
		countryAccountId: string | null,
		tx?: Tx,
	): Promise<SelectInstanceSystemSettings | null> => {
		if (!countryAccountId) {
			return null;
		}
		const result = await (tx ?? dr)
			.select()
			.from(instanceSystemSettingsTable)
			.where(
				eq(instanceSystemSettingsTable.countryAccountsId, countryAccountId),
			);
		return result[0] || null;
	},

	create: async (data: Omit<InsertInstanceSystemSettings, "id">, tx?: Tx) => {
		return (tx ?? dr)
			.insert(instanceSystemSettingsTable)
			.values(data)
			.returning()
			.execute()
			.then((result) => result[0]);
	},

	update: async (
		id: string,
		data: Partial<
			Omit<
				InsertInstanceSystemSettings,
				"id" | "countryAccountsId" | "dtsInstanceCtryIso3" | "countryName"
			>
		>,
		tx?: Tx,
		countryAccountsId?: string,
	): Promise<SelectInstanceSystemSettings | null> => {
		const whereClause = countryAccountsId
			? and(
					eq(instanceSystemSettingsTable.id, id),
					eq(
						instanceSystemSettingsTable.countryAccountsId,
						countryAccountsId,
					),
				)
			: eq(instanceSystemSettingsTable.id, id);

		return (tx ?? dr)
			.update(instanceSystemSettingsTable)
			.set({
				...data,
			})
			.where(whereClause)
			.returning()
			.execute()
			.then((result) => result[0] || null);
	},
};
