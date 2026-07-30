import { eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterRecordsDivisionTable,
	InsertDisasterRecordsDivision,
} from "~/drizzle/schema";

export const DisasterRecordsDivisionRepository = {
	getByDisasterRecordId: (disasterRecordId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disasterRecordsDivisionTable)
			.where(
				eq(disasterRecordsDivisionTable.disasterRecordId, disasterRecordId),
			);
	},
	getByDisasterRecordIds: (disasterRecordIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disasterRecordsDivisionTable)
			.where(
				inArray(
					disasterRecordsDivisionTable.disasterRecordId,
					disasterRecordIds,
				),
			);
	},
	createMany: (data: InsertDisasterRecordsDivision[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(disasterRecordsDivisionTable)
			.values(data)
			.returning()
			.execute();
	},
	deleteByDisasterRecordId: (disasterRecordId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterRecordsDivisionTable)
			.where(
				eq(disasterRecordsDivisionTable.disasterRecordId, disasterRecordId),
			);
	},
	deleteByDisasterRecordIds: (disasterRecordIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterRecordsDivisionTable)
			.where(
				inArray(
					disasterRecordsDivisionTable.disasterRecordId,
					disasterRecordIds,
				),
			);
	},
};
