import { asc, eq } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	assessmentTypeTable,
	disasterEventAssessmentTable,
	InsertDisasterEventAssessment,
	SelectDisasterEventAssessment,
} from "~/drizzle/schema";

export type DisasterEventAssessmentListItem = SelectDisasterEventAssessment & {
	assessmentType: string;
};

export const DisasterEventAssessmentRepository = {
	listByDisasterEventId: async (
		disasterEventId: string,
		tx?: Tx,
	): Promise<DisasterEventAssessmentListItem[]> => {
		const rows = await (tx ?? dr)
			.select({
				id: disasterEventAssessmentTable.id,
				disasterEventId: disasterEventAssessmentTable.disasterEventId,
				assessmentTypeId: disasterEventAssessmentTable.assessmentTypeId,
				coverage: disasterEventAssessmentTable.coverage,
				assessmentDate: disasterEventAssessmentTable.assessmentDate,
				description: disasterEventAssessmentTable.description,
				otherSectors: disasterEventAssessmentTable.otherSectors,
				assessmentType: assessmentTypeTable.type,
			})
			.from(disasterEventAssessmentTable)
			.innerJoin(
				assessmentTypeTable,
				eq(
					disasterEventAssessmentTable.assessmentTypeId,
					assessmentTypeTable.id,
				),
			)
			.where(eq(disasterEventAssessmentTable.disasterEventId, disasterEventId))
			.orderBy(asc(disasterEventAssessmentTable.assessmentDate));

		return rows;
	},
	createMany: async (data: InsertDisasterEventAssessment[], tx?: Tx) => {
		if (data.length === 0) {
			return [] as SelectDisasterEventAssessment[];
		}

		return (tx ?? dr)
			.insert(disasterEventAssessmentTable)
			.values(data)
			.returning();
	},
	createOne: async (data: InsertDisasterEventAssessment, tx?: Tx) => {
		const rows = await (tx ?? dr)
			.insert(disasterEventAssessmentTable)
			.values(data)
			.returning();

		return rows[0] ?? null;
	},
	deleteByDisasterEventId: (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventAssessmentTable)
			.where(eq(disasterEventAssessmentTable.disasterEventId, disasterEventId));
	},
};
