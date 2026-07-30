import { eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterEventGeomTable,
	InsertDisasterEventGeom,
} from "~/drizzle/schema";

export const DisasterEventGeomRepository = {
	getByDisasterEventId: (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disasterEventGeomTable)
			.where(eq(disasterEventGeomTable.disasterEventId, disasterEventId));
	},
	getByDisasterEventIds: (disasterEventIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disasterEventGeomTable)
			.where(inArray(disasterEventGeomTable.disasterEventId, disasterEventIds));
	},
	createMany: (data: InsertDisasterEventGeom[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(disasterEventGeomTable)
			.values(data)
			.returning()
			.execute();
	},
	deleteByDisasterEventId: (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventGeomTable)
			.where(eq(disasterEventGeomTable.disasterEventId, disasterEventId));
	},
	deleteByDisasterEventIds: (disasterEventIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventGeomTable)
			.where(inArray(disasterEventGeomTable.disasterEventId, disasterEventIds));
	},
};
