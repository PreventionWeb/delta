import { and, asc, eq, inArray } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	assessmentTypeTable,
	InsertAssessmentType,
	SelectAssessmentType,
} from "~/drizzle/schema";

export const AssessmentTypeRepository = {
	createMany: async (data: InsertAssessmentType[], tx?: Tx) => {
		if (data.length === 0) {
			return [] as SelectAssessmentType[];
		}
		return (tx ?? dr).insert(assessmentTypeTable).values(data).returning();
	},
	listAll: (tx?: Tx) => {
		return (tx ?? dr)
			.select()
			.from(assessmentTypeTable)
			.orderBy(asc(assessmentTypeTable.type));
	},
	getById: (id: string, tx?: Tx) => {
		return (tx ?? dr).query.assessmentTypeTable.findFirst({
			where: eq(assessmentTypeTable.id, id),
		});
	},
	getByType: (type: string, tx?: Tx) => {
		return (tx ?? dr).query.assessmentTypeTable.findFirst({
			where: eq(assessmentTypeTable.type, type),
		});
	},
	getByTypes: (types: string[], tx?: Tx) => {
		if (types.length === 0) {
			return Promise.resolve([] as SelectAssessmentType[]);
		}
		return (tx ?? dr)
			.select()
			.from(assessmentTypeTable)
			.where(inArray(assessmentTypeTable.type, types));
	},
	deleteByType: (type: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(assessmentTypeTable)
			.where(eq(assessmentTypeTable.type, type));
	},
	deleteByIdAndType: (id: string, type: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(assessmentTypeTable)
			.where(
				and(eq(assessmentTypeTable.id, id), eq(assessmentTypeTable.type, type)),
			);
	},
};
