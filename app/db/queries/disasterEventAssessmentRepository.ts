import { and, asc, eq } from "drizzle-orm";
import { dr, Tx } from "~/db.server";
import {
	assessmentTypeTable,
	disasterEventTable,
	disasterEventAssessmentTable,
	InsertDisasterEventAssessment,
	SelectDisasterEventAssessment,
} from "~/drizzle/schema";

export type DisasterEventAssessmentListItem = SelectDisasterEventAssessment & {
	assessmentType: string;
};

export const DisasterEventAssessmentRepository = {
	withTransaction: <T>(run: (tx: Tx) => Promise<T>) => {
		return dr.transaction(run);
	},
	listByCountryAccountsId: async (
		countryAccountsId: string,
		disasterEventId?: string,
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
				disasterEventTable,
				eq(disasterEventAssessmentTable.disasterEventId, disasterEventTable.id),
			)
			.innerJoin(
				assessmentTypeTable,
				eq(
					disasterEventAssessmentTable.assessmentTypeId,
					assessmentTypeTable.id,
				),
			)
			.where(
				and(
					eq(disasterEventTable.countryAccountsId, countryAccountsId),
					disasterEventId
						? eq(disasterEventAssessmentTable.disasterEventId, disasterEventId)
						: undefined,
				),
			)
			.orderBy(asc(disasterEventAssessmentTable.assessmentDate));

		return rows;
	},
	getByIdAndCountryAccountsId: async (
		id: string,
		countryAccountsId: string,
		tx?: Tx,
	): Promise<DisasterEventAssessmentListItem | null> => {
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
				disasterEventTable,
				eq(disasterEventAssessmentTable.disasterEventId, disasterEventTable.id),
			)
			.innerJoin(
				assessmentTypeTable,
				eq(
					disasterEventAssessmentTable.assessmentTypeId,
					assessmentTypeTable.id,
				),
			)
			.where(
				and(
					eq(disasterEventAssessmentTable.id, id),
					eq(disasterEventTable.countryAccountsId, countryAccountsId),
				),
			);

		return rows[0] ?? null;
	},
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
	updateById: async (
		id: string,
		data: Partial<InsertDisasterEventAssessment>,
		tx?: Tx,
	) => {
		const rows = await (tx ?? dr)
			.update(disasterEventAssessmentTable)
			.set(data)
			.where(eq(disasterEventAssessmentTable.id, id))
			.returning();

		return rows[0] ?? null;
	},
	deleteById: (id: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventAssessmentTable)
			.where(eq(disasterEventAssessmentTable.id, id));
	},
	deleteByDisasterEventId: (disasterEventId: string, tx?: Tx) => {
		return (tx ?? dr)
			.delete(disasterEventAssessmentTable)
			.where(eq(disasterEventAssessmentTable.disasterEventId, disasterEventId));
	},
};
