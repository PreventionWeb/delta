import { eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	hazardousEventGeomTable,
	InsertHazardousEventGeom,
} from "~/drizzle/schema";

export const HazardousEventGeomRepository = {
	getByHazardousEventId: (hazardousEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(hazardousEventGeomTable)
			.where(eq(hazardousEventGeomTable.hazardousEventId, hazardousEventId));
	},
	getByHazardousEventIds: (hazardousEventIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(hazardousEventGeomTable)
			.where(
				inArray(hazardousEventGeomTable.hazardousEventId, hazardousEventIds),
			);
	},
	createMany: (data: InsertHazardousEventGeom[], tx?: Tx) => {
		return (tx ?? dr)
			.insert(hazardousEventGeomTable)
			.values(data)
			.returning()
			.execute();
	},
	deleteByHazardousEventId: (hazardousEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(hazardousEventGeomTable)
			.where(eq(hazardousEventGeomTable.hazardousEventId, hazardousEventId));
	},
	deleteByHazardousEventIds: (hazardousEventIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(hazardousEventGeomTable)
			.where(
				inArray(hazardousEventGeomTable.hazardousEventId, hazardousEventIds),
			);
	},
};
