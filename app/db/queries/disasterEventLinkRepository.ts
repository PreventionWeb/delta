import { desc, eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterEventLinkTable,
	InsertDisasterEventLink,
} from "~/drizzle/schema";

export const DisasterEventLinkRepository = {
	getByDisasterEventIds: (disasterEventIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(disasterEventLinkTable)
			.where(inArray(disasterEventLinkTable.disasterEventId, disasterEventIds));
	},

	getByDisasterEventId: (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.select({
				id: disasterEventLinkTable.id,
				title: disasterEventLinkTable.title,
				url: disasterEventLinkTable.url,
				createdAt: disasterEventLinkTable.createdAt,
			})
			.from(disasterEventLinkTable)
			.where(eq(disasterEventLinkTable.disasterEventId, disasterEventId))
			.orderBy(desc(disasterEventLinkTable.createdAt));
	},

	createMany: (data: InsertDisasterEventLink[], tx?: Tx) => {
		return (tx ?? dr).insert(disasterEventLinkTable).values(data);
	},

	deleteByDisasterEventIds: (disasterEventIds: string[], tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventLinkTable)
			.where(inArray(disasterEventLinkTable.disasterEventId, disasterEventIds));
	},

	deleteByDisasterEventId: (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventLinkTable)
			.where(eq(disasterEventLinkTable.disasterEventId, disasterEventId));
	},
};
