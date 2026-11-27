import { getTableName } from "drizzle-orm";
import { createDeleteActionWithCountryAccounts } from "~/backend.server/handlers/form/form";
import {
	disruptionById,
	disruptionDeleteById,
} from "~/backend.server/models/disruption";
import { disruptionTable } from "~/drizzle/schema/disruptionTable";

import { route2 } from "~/frontend/disruption";

import { ContentRepeaterUploadFile } from "~/components/ContentRepeater/UploadFile";
import { ActionFunction } from "react-router";
import { requireUser } from "~/utils/auth";
import { getCountryAccountsIdFromSession } from "~/utils/session";

export const action: ActionFunction = async (args) => {
	const { request } = args;
	const userSession = await requireUser(args);

	if (!userSession) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) {
		throw new Response("Unauthorized, no instance selected.", { status: 401 });
	}

	return createDeleteActionWithCountryAccounts({
		redirectToSuccess: (_id: string, oldRecord: any) =>
			route2(oldRecord.recordId) + "?sectorId=" + oldRecord.sectorId,
		delete: async (id: string) => {
			return disruptionDeleteById(id, countryAccountsId);
		},
		tableName: getTableName(disruptionTable),
		getById: disruptionById,
		postProcess: async (_id, data) => {
			ContentRepeaterUploadFile.delete(
				data.attachments,
				undefined,
				countryAccountsId,
			);
		},
		countryAccountsId,
	})(args);
};
