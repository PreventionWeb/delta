import { eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	disasterEventAssessmentSectorTable,
	InsertDisasterEventAssessmentSector,
	SelectDisasterEventAssessmentSector,
} from "~/drizzle/schema";

export const DisasterEventAssessmentSectorRepository = {
	listByDisasterEventAssessmentId: (
		disasterEventAssessmentId: string,
		tx?: Tx,
	): Promise<SelectDisasterEventAssessmentSector[]> => {
		return (tx ?? dr)
			.select()
			.from(disasterEventAssessmentSectorTable)
			.where(
				eq(
					disasterEventAssessmentSectorTable.disasterEventAssessmentId,
					disasterEventAssessmentId,
				),
			);
	},
	listByDisasterEventAssessmentIds: (
		disasterEventAssessmentIds: string[],
		tx?: Tx,
	): Promise<SelectDisasterEventAssessmentSector[]> => {
		if (disasterEventAssessmentIds.length === 0) {
			return Promise.resolve([] as SelectDisasterEventAssessmentSector[]);
		}
		return (tx ?? dr)
			.select()
			.from(disasterEventAssessmentSectorTable)
			.where(
				inArray(
					disasterEventAssessmentSectorTable.disasterEventAssessmentId,
					disasterEventAssessmentIds,
				),
			);
	},
	createMany: async (data: InsertDisasterEventAssessmentSector[], tx?: Tx) => {
		if (data.length === 0) {
			return [] as SelectDisasterEventAssessmentSector[];
		}
		return (tx ?? dr)
			.insert(disasterEventAssessmentSectorTable)
			.values(data)
			.returning();
	},
	deleteByDisasterEventAssessmentId: (
		disasterEventAssessmentId: string,
		tx?: Tx,
	) => {
		return (tx ?? dr)
			.delete(disasterEventAssessmentSectorTable)
			.where(
				eq(
					disasterEventAssessmentSectorTable.disasterEventAssessmentId,
					disasterEventAssessmentId,
				),
			);
	},
	deleteByDisasterEventAssessmentIds: (
		disasterEventAssessmentIds: string[],
		tx?: Tx,
	) => {
		if (disasterEventAssessmentIds.length === 0) {
			return Promise.resolve();
		}
		return (tx ?? dr)
			.delete(disasterEventAssessmentSectorTable)
			.where(
				inArray(
					disasterEventAssessmentSectorTable.disasterEventAssessmentId,
					disasterEventAssessmentIds,
				),
			);
	},
};
