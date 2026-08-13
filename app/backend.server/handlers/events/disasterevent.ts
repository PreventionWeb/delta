import { disasterRecordsTable } from "~/drizzle/schema/disasterRecordsTable";
import { declarationStatusTable } from "~/drizzle/schema/declarationStatusTable";
import { disasterEventDeclarationTable } from "~/drizzle/schema/disasterEventDeclarationTable";
import { disasterEventAssessmentTable } from "~/drizzle/schema/disasterEventAssessmentTable";
import { disasterEventResponseTable } from "~/drizzle/schema/disasterEventResponseTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { responseTypeTable } from "~/drizzle/schema/responseTypeTable";
import { assessmentTypeTable } from "~/drizzle/schema/assessmentTypeTable";

import { authLoaderIsPublic } from "~/utils/auth";

import { dr } from "~/db.server";

import {
	executeQueryForPagination3,
	OffsetLimit,
} from "~/frontend/pagination/api.server";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { approvalStatusIds } from "~/frontend/approval";
import {
	getCountryAccountsIdFromSession,
	getCountrySettingsFromSession,
	getUserIdFromSession,
	getUserRoleFromSession,
} from "~/utils/session";
import { getCommonData } from "../commondata";
import { entityValidationAssignmentTable } from "~/drizzle/schema/entityValidationAssignmentTable";

interface disasterEventLoaderArgs {
	loaderArgs: {
		params: { lang?: string };
		request: Request;
	};
}

export async function disasterEventsLoader(args: disasterEventLoaderArgs) {
	const { loaderArgs } = args;
	const { request } = loaderArgs;
	const userId = (await getUserIdFromSession(request)) as string;
	const userRole = await getUserRoleFromSession(request);
	const url = new URL(request.url);
	const extraParams = ["search", "viewMyRecords", "pendingMyAction"];

	const filters: {
		approvalStatus?: approvalStatusIds;
		search: string;

		// New filter parameters
		disasterEventName?: string;
		recordingInstitution?: string;
		fromDate?: string;
		toDate?: string;
		recordStatus?: string;
		viewMyRecords?: boolean;
		pendingMyAction?: boolean;
		userId?: string; // For user-specific filters
	} = {
		approvalStatus: "published",
		search: url.searchParams.get("search") || "",

		// New filters
		disasterEventName: url.searchParams.get("disasterEventName") || "",
		recordingInstitution: url.searchParams.get("recordingInstitution") || "",
		fromDate: url.searchParams.get("fromDate") || "",
		toDate: url.searchParams.get("toDate") || "",
		recordStatus: url.searchParams.get("recordStatus") || "",
		viewMyRecords: url.searchParams.get("viewMyRecords") === "on",
		pendingMyAction: url.searchParams.get("pendingMyAction") === "on",
	};

	const isPublic = authLoaderIsPublic(loaderArgs);

	if (!isPublic) {
		filters.approvalStatus = undefined;
	}
	if (isPublic) {
		filters.recordStatus = undefined;
	}

	filters.userId = userId;

	filters.search = filters.search.trim();

	let searchIlike = "%" + filters.search + "%";
	let disasterEventNameIlike = "%" + filters.disasterEventName + "%";
	let recordingInstitutionIlike = "%" + filters.recordingInstitution + "%";

	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	let instanceName = "DELTA Resilience";
	if (countryAccountsId) {
		const settigns = await getCountrySettingsFromSession(request);
		instanceName = settigns.websiteName;
	}

	let condition = and(
		countryAccountsId
			? eq(disasterEventTable.countryAccountsId, countryAccountsId)
			: undefined,
		filters.approvalStatus
			? eq(disasterEventTable.approvalStatus, filters.approvalStatus)
			: undefined,
		filters.disasterEventName
			? or(
					sql`${disasterEventTable.id}::text ILIKE ${disasterEventNameIlike}`,
					sql`${disasterEventTable.nameNational}::text ILIKE ${disasterEventNameIlike}`,
					sql`${disasterEventTable.nameGlobalOrRegional}::text ILIKE ${disasterEventNameIlike}`,
				)
			: undefined,
		filters.recordingInstitution
			? sql`${disasterEventTable.recordingInstitution}::text ILIKE ${recordingInstitutionIlike}`
			: undefined,
		filters.recordStatus
			? sql`${disasterEventTable.approvalStatus}::text ILIKE ${filters.recordStatus}`
			: undefined,

		// User-specific filters - Note: These fields may need to be added to schema
		// For now, commenting out until proper user tracking fields are available
		filters.viewMyRecords && filters.userId
			? or(
					eq(disasterEventTable.createdByUserId, filters.userId),
					eq(disasterEventTable.validatedByUserId, filters.userId),
					eq(disasterEventTable.publishedByUserId, filters.userId),
				)
			: undefined,

		// Pending action filter - simplified for now
		filters.pendingMyAction && filters.userId
			? or(
					and(
						eq(disasterEventTable.approvalStatus, "needs-revision"),
						eq(disasterEventTable.submittedByUserId, filters.userId),
					),
					and(
						eq(disasterEventTable.approvalStatus, "waiting-for-validation"),
						sql`EXISTS (
						SELECT 1 FROM ${entityValidationAssignmentTable}
						WHERE (
							entity_validation_assignment.entity_Id = ${disasterEventTable.id}
							AND entity_validation_assignment.entity_type = 'disaster_event'
							AND entity_validation_assignment.assigned_to_user_id = ${filters.userId}
						)
					)`,
					),
				)
			: undefined,

		// Date range filters (for event dates, not record creation)
		// filters.fromDate ? sql`${disasterEventTable.startDate} >= ${filters.fromDate}` : undefined,
		filters.fromDate
			? and(
					sql`${disasterEventTable.startDate} != ''`,
					sql`
					CASE
						WHEN ${disasterEventTable.startDate} ~ '^[0-9]{4}$' THEN TO_DATE(${disasterEventTable.startDate}, 'YYYY') >= TO_DATE(${filters.fromDate}, 'YYYY')
						WHEN ${disasterEventTable.startDate} ~ '^[0-9]{4}-[0-9]{1}$' THEN TO_DATE(${disasterEventTable.startDate}, 'YYYY-MM') >= TO_DATE(${filters.fromDate}, 'YYYY-MM')
						WHEN ${disasterEventTable.startDate} ~ '^[0-9]{4}-[0-9]{2}$' THEN TO_DATE(${disasterEventTable.startDate}, 'YYYY-MM') >= TO_DATE(${filters.fromDate}, 'YYYY-MM')
						WHEN ${disasterEventTable.startDate} ~ '^[0-9]{4}-[0-9]{1}-[0-9]{1}$' THEN TO_DATE(${disasterEventTable.startDate}, 'YYYY-MM-DD') >= TO_DATE(${filters.fromDate}, 'YYYY-MM-DD')
						WHEN ${disasterEventTable.startDate} ~ '^[0-9]{4}-[0-9]{1}-[0-9]{2}$' THEN TO_DATE(${disasterEventTable.startDate}, 'YYYY-MM-DD') >= TO_DATE(${filters.fromDate}, 'YYYY-MM-DD')
						WHEN ${disasterEventTable.startDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{1}$' THEN TO_DATE(${disasterEventTable.startDate}, 'YYYY-MM-DD') >= TO_DATE(${filters.fromDate}, 'YYYY-MM-DD')
						WHEN ${disasterEventTable.startDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN TO_DATE(${disasterEventTable.startDate}, 'YYYY-MM-DD') >= TO_DATE(${filters.fromDate}, 'YYYY-MM-DD')
					ELSE 
						${disasterEventTable.startDate} >= ${filters.fromDate}
					END
				`,
				)
			: undefined,
		// filters.toDate ? sql`${disasterEventTable.endDate} <= ${filters.toDate}` : undefined,
		filters.toDate
			? and(
					sql`${disasterEventTable.endDate} != ''`,
					sql`
					CASE
						WHEN ${disasterEventTable.endDate} ~ '^[0-9]{4}$' THEN TO_DATE(${disasterEventTable.endDate}, 'YYYY') <= TO_DATE(${filters.toDate}, 'YYYY')
						WHEN ${disasterEventTable.endDate} ~ '^[0-9]{4}-[0-9]{1}$' THEN TO_DATE(${disasterEventTable.endDate}, 'YYYY-MM') <= TO_DATE(${filters.toDate}, 'YYYY-MM')
						WHEN ${disasterEventTable.endDate} ~ '^[0-9]{4}-[0-9]{2}$' THEN TO_DATE(${disasterEventTable.endDate}, 'YYYY-MM') <= TO_DATE(${filters.toDate}, 'YYYY-MM')
						WHEN ${disasterEventTable.endDate} ~ '^[0-9]{4}-[0-9]{1}-[0-9]{1}$' THEN TO_DATE(${disasterEventTable.endDate}, 'YYYY-MM-DD') <= TO_DATE(${filters.toDate}, 'YYYY-MM-DD')
						WHEN ${disasterEventTable.endDate} ~ '^[0-9]{4}-[0-9]{1}-[0-9]{2}$' THEN TO_DATE(${disasterEventTable.endDate}, 'YYYY-MM-DD') <= TO_DATE(${filters.toDate}, 'YYYY-MM-DD')
						WHEN ${disasterEventTable.endDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{1}$' THEN TO_DATE(${disasterEventTable.endDate}, 'YYYY-MM-DD') <= TO_DATE(${filters.toDate}, 'YYYY-MM-DD')
						WHEN ${disasterEventTable.endDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN TO_DATE(${disasterEventTable.endDate}, 'YYYY-MM-DD') <= TO_DATE(${filters.toDate}, 'YYYY-MM-DD')
					ELSE 
						${disasterEventTable.endDate} <= ${filters.toDate}
					END
				`,
				)
			: undefined,
		filters.search !== ""
			? or(
					filters.search
						? or(
								sql`${disasterEventTable.id}::text ILIKE ${searchIlike}`,
								sql`${disasterEventTable.hazardousEventId}::text ILIKE ${searchIlike}`,
								sql`${disasterEventTable.disasterEventId}::text ILIKE ${searchIlike}`,
								eq(disasterEventTable.nationalDisasterId, searchIlike),
								eq(disasterEventTable.otherId1, searchIlike),
								eq(disasterEventTable.otherId2, searchIlike),
								eq(disasterEventTable.otherId3, searchIlike),
								eq(disasterEventTable.glide, searchIlike),
								ilike(disasterEventTable.nameNational, searchIlike),
								ilike(disasterEventTable.nameGlobalOrRegional, searchIlike),
								ilike(disasterEventTable.startDate, searchIlike),
								ilike(disasterEventTable.endDate, searchIlike),
								ilike(disasterEventTable.startDateLocal, searchIlike),
								ilike(disasterEventTable.endDateLocal, searchIlike),
								sql`EXISTS (
									SELECT 1
									FROM ${disasterEventDeclarationTable} ded
									LEFT JOIN ${declarationStatusTable} ds
										ON ds.id = ded.declaration_status_id
									WHERE ded.disaster_event_id = ${disasterEventTable.id}
									AND (
										COALESCE(ded.type, '') ILIKE ${searchIlike}
										OR COALESCE(ded.effects, '') ILIKE ${searchIlike}
										OR COALESCE(ded.coverage, '') ILIKE ${searchIlike}
										OR COALESCE(ded.issuing_organization, '') ILIKE ${searchIlike}
										OR COALESCE(ds.status, '') ILIKE ${searchIlike}
									)
								)`,
								ilike(
									disasterEventTable.officialWarningAffectedAreas,
									searchIlike,
								),
								sql`EXISTS (
									SELECT 1
									FROM ${disasterEventResponseTable} der
									INNER JOIN ${responseTypeTable} rt
										ON rt.id = der.response_type_id
									WHERE der.disaster_event_id = ${disasterEventTable.id}
									AND (
										COALESCE(der.description, '') ILIKE ${searchIlike}
										OR COALESCE(der.coverage, '') ILIKE ${searchIlike}
										OR rt.type ILIKE ${searchIlike}
									)
								)`,
								sql`EXISTS (
									SELECT 1
									FROM ${disasterEventAssessmentTable} dea
									INNER JOIN ${assessmentTypeTable} at
										ON at.id = dea.assessment_type_id
									WHERE dea.disaster_event_id = ${disasterEventTable.id}
									AND (
										COALESCE(dea.description, '') ILIKE ${searchIlike}
										OR COALESCE(dea.coverage, '') ILIKE ${searchIlike}
										OR COALESCE(dea.other_sectors, '') ILIKE ${searchIlike}
										OR at.type ILIKE ${searchIlike}
									)
								)`,
								ilike(disasterEventTable.dataSource, searchIlike),
								ilike(disasterEventTable.recordingInstitution, searchIlike),
								ilike(disasterEventTable.nonEconomicLosses, searchIlike),
								ilike(
									disasterEventTable.responseOperationsDescription,
									searchIlike,
								),
								ilike(
									disasterEventTable.humanitarianNeedsDescription,
									searchIlike,
								),
							)
						: undefined,
				)
			: undefined,
	);

	// in case of data viewer role, force the filter on approvalStatus to validated and published
	if (userRole === "data-viewer") {
		condition = and(
			condition,
			or(
				eq(disasterEventTable.approvalStatus, "validated"),
				eq(disasterEventTable.approvalStatus, "published"),
			),
		);
	}

	const count = await dr.$count(disasterEventTable, condition);
	// const events = async (offsetLimit: OffsetLimit) => {
	// 	return await dr.query.disasterEventTable.findMany({
	// 		...offsetLimit,
	// 		columns: {
	// 			id: true,
	// 			startDate: true,
	// 			endDate: true,
	// 			approvalStatus: true,
	// 			updatedAt: true,
	// 			createdAt: true,
	// 			nameNational: true,
	// 			nameGlobalOrRegional: true,
	// 		},
	// 		with: {
	// 			hazardousEvent: {
	// 				with: hazardBasicInfoJoin,
	// 			},
	// 		},
	// 		orderBy: [desc(disasterEventTable.updatedAt)],
	// 		where: condition,
	// 	});
	// };

	const events2 = async (offsetLimit: OffsetLimit) => {
		return await dr
			.select({
				id: disasterEventTable.id,
				startDate: disasterEventTable.startDate,
				endDate: disasterEventTable.endDate,
				approvalStatus: disasterEventTable.approvalStatus,
				updatedAt: disasterEventTable.updatedAt,
				createdAt: disasterEventTable.createdAt,
				nameNational: disasterEventTable.nameNational,
				nameGlobalOrRegional: disasterEventTable.nameGlobalOrRegional,

				// Hazardous event fields
				hazardId: hazardousEventTable.id,

				// Optional: count of disaster records
				recordCount: sql<number>`(
					SELECT COUNT(*) FROM ${disasterRecordsTable}
					WHERE ${disasterRecordsTable.disasterEventId} = ${disasterEventTable.id}
				)`.as("recordCount"),
			})
			.from(disasterEventTable)
			.leftJoin(
				hazardousEventTable,
				eq(hazardousEventTable.id, disasterEventTable.hazardousEventId),
			)
			.where(condition)
			.orderBy(desc(disasterEventTable.updatedAt))
			.limit(offsetLimit.limit)
			.offset(offsetLimit.offset);
	};

	const res = await executeQueryForPagination3(
		request,
		count,
		events2,
		extraParams,
	);

	return {
		common: await getCommonData(args.loaderArgs),
		isPublic,
		filters,
		data: res,
		instanceName,
	};
}
