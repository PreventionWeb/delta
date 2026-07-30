import { eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterRecordsGeomTable,
	InsertDisasterRecordsGeom,
} from "~/drizzle/schema";

export const DisasterRecordsGeomRepository = {
	getByDisasterRecordId: (disasterRecordId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disasterRecordsGeomTable)
			.where(eq(disasterRecordsGeomTable.disasterRecordId, disasterRecordId));
	},
	getByDisasterRecordIds: (disasterRecordIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disasterRecordsGeomTable)
			.where(
				inArray(disasterRecordsGeomTable.disasterRecordId, disasterRecordIds),
			);
	},
	createMany: (data: InsertDisasterRecordsGeom[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(disasterRecordsGeomTable)
			.values(data)
			.returning()
			.execute();
	},
	deleteByDisasterRecordId: (disasterRecordId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterRecordsGeomTable)
			.where(eq(disasterRecordsGeomTable.disasterRecordId, disasterRecordId));
	},
	deleteByDisasterRecordIds: (disasterRecordIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterRecordsGeomTable)
			.where(
				inArray(disasterRecordsGeomTable.disasterRecordId, disasterRecordIds),
			);
	},
};
