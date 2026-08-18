import { disasterEventById } from "~/backend.server/models/event";

import { DisasterEventView } from "~/frontend/events/disastereventform";

import { createViewLoaderPublicApproved } from "~/backend.server/handlers/form/form";

import { ViewScreenPublicApproved } from "~/frontend/form";
import {
	authActionGetAuth,
	authActionWithPerm,
	optionalUser,
} from "~/utils/auth";

// import { dr } from "~/db.server";
// import { sql } from "drizzle-orm";
import { getCountryAccountsIdFromSession } from "~/utils/session";
import { ViewContext } from "~/frontend/context";
import { useLoaderData } from "react-router";

import { LoaderFunctionArgs } from "react-router";
import { BackendContext } from "~/backend.server/context";
import { processApprovalStatusActionService } from "~/services/approvalStatusWorkflowService";
import { getUserIdFromSession } from "~/utils/session";
import { getReturnAssigneeUsers } from "~/db/queries/userCountryAccountsRepository";
import { DisasterEventAttachmentRepository } from "~/db/queries/disasterEventAttachmentRepository";
import { DisasterEventDeclarationAttachmentRepository } from "~/db/queries/disasterEventDeclarationAttachmentRepository";
import { DisasterEventAssessmentAttachmentRepository } from "~/db/queries/disasterEventAssessmentAttachmentRepository";
import { DisasterEventAssessmentRepository } from "~/db/queries/disasterEventAssessmentRepository";
import { DisasterEventAssessmentSectorRepository } from "~/db/queries/disasterEventAssessmentSectorRepository";
import { DisasterEventDeclarationRepository } from "~/db/queries/disasterEventDeclarationRepository";
import { DisasterEventLinkRepository } from "~/db/queries/disasterEventLinkRepository";
import { DisasterEventResponseRepository } from "~/db/queries/disasterEventResponseRepository";
import { DisasterEventResponseAttachmentRepository } from "~/db/queries/disasterEventResponseAttachmentRepository";
import { dr } from "~/db.server";
import { disasterEventDivisionTable } from "~/drizzle/schema/disasterEventDivisionTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { disasterRecordsTable } from "~/drizzle/schema/disasterRecordsTable";
import { eventCausalityTable } from "~/drizzle/schema/eventCausalityTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { hazardousEventDivisionTable } from "~/drizzle/schema/hazardousEventDivisionTable";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { sectorTable } from "~/drizzle/schema/sectorTable";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

function localizedName(
	name: Record<string, string> | null | undefined,
	lang: string,
) {
	if (!name) {
		return "";
	}

	return String(name[lang] || name.en || Object.values(name)[0] || "").trim();
}

function parseYmd(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) {
		return null;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);

	if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) {
		return null;
	}

	return { year, month, day };
}

function toUtcDate(parts: { year: number; month: number; day: number }) {
	return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function formatEventDateRange(
	startDate: string | null | undefined,
	endDate: string | null | undefined,
	lang: string,
) {
	const start = parseYmd(startDate);
	const end = parseYmd(endDate);
	const formatter = new Intl.DateTimeFormat(lang || "en", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});

	if (start && end) {
		const startUtc = toUtcDate(start);
		const endUtc = toUtcDate(end);

		if (typeof formatter.formatRange === "function") {
			return formatter.formatRange(startUtc, endUtc);
		}

		return `${formatter.format(startUtc)} - ${formatter.format(endUtc)}`;
	}

	if (start) {
		return formatter.format(toUtcDate(start));
	}

	if (end) {
		return formatter.format(toUtcDate(end));
	}

	return [startDate, endDate]
		.map((value) => value?.trim())
		.filter(Boolean)
		.join(" - ");
}

function formatDisasterEventLabel(
	event: {
		id: string;
		nameNational: string | null;
		nameGlobalOrRegional: string | null;
		startDate: string | null;
		endDate: string | null;
		hipHazard: { code: string | null; name: Record<string, string> | null } | null;
		hipCluster: { name: Record<string, string> | null } | null;
		hipType: { name: Record<string, string> | null } | null;
	},
	lang: string,
	divisionNames: string[],
) {
	const displayName =
		event.nameNational?.trim() ||
		event.nameGlobalOrRegional?.trim() ||
		`DE: ${event.id.slice(0, 8)}`;
	const hazardName = localizedName(event.hipHazard?.name, lang);
	const clusterName = localizedName(event.hipCluster?.name, lang);
	const typeName = localizedName(event.hipType?.name, lang);
	const hipLabel = hazardName
		? event.hipHazard?.code
			? `H: ${hazardName} (${event.hipHazard.code})`
			: `H: ${hazardName}`
		: clusterName
			? `C: ${clusterName}`
			: typeName
				? `T: ${typeName}`
				: "";

	return {
		id: event.id,
		name: displayName,
		code: event.id,
		hip: hipLabel,
		dateLabel: formatEventDateRange(event.startDate, event.endDate, lang),
		divisionNamesLabel: divisionNames.join(", "),
	};
}

function formatDisasterRecordLabel(
	record: {
		id: string;
		hipHazard: { name: Record<string, string> | null; code: string | null } | null;
		hipCluster: { name: Record<string, string> | null } | null;
		hipType: { name: Record<string, string> | null } | null;
	},
	lang: string,
) {
	const hazardName = localizedName(record.hipHazard?.name, lang);
	const clusterName = localizedName(record.hipCluster?.name, lang);
	const typeName = localizedName(record.hipType?.name, lang);
	const hipLabel = hazardName
		? record.hipHazard?.code
			? `H: ${hazardName} (${record.hipHazard.code})`
			: `H: ${hazardName}`
		: clusterName
			? `C: ${clusterName}`
			: typeName
				? `T: ${typeName}`
				: "";

	return {
		id: record.id,
		name: `UUID: ${record.id.slice(0, 8)}`,
		code: record.id,
		hip: hipLabel,
	};
}

async function getLinkedViewData(args: {
	itemId: string;
	countryAccountsId: string;
	lang: string;
}) {
	const { itemId, countryAccountsId, lang } = args;

	const [triggeringHeLinks, triggeredHeLinks, triggeringDeLinks, triggeredDeLinks] =
		await Promise.all([
			dr
				.select({ linkedId: eventCausalityTable.triggeringHazardousEventId })
				.from(eventCausalityTable)
				.where(
					and(
						eq(eventCausalityTable.triggeringEntityType, "HE"),
						eq(eventCausalityTable.triggeredEntityType, "DE"),
						eq(eventCausalityTable.triggeredDisasterEventId, itemId),
					),
				),
			dr
				.select({ linkedId: eventCausalityTable.triggeredHazardousEventId })
				.from(eventCausalityTable)
				.where(
					and(
						eq(eventCausalityTable.triggeringEntityType, "DE"),
						eq(eventCausalityTable.triggeredEntityType, "HE"),
						eq(eventCausalityTable.triggeringDisasterEventId, itemId),
					),
				),
			dr
				.select({ linkedId: eventCausalityTable.triggeringDisasterEventId })
				.from(eventCausalityTable)
				.where(
					and(
						eq(eventCausalityTable.triggeringEntityType, "DE"),
						eq(eventCausalityTable.triggeredEntityType, "DE"),
						eq(eventCausalityTable.triggeredDisasterEventId, itemId),
					),
				),
			dr
				.select({ linkedId: eventCausalityTable.triggeredDisasterEventId })
				.from(eventCausalityTable)
				.where(
					and(
						eq(eventCausalityTable.triggeringEntityType, "DE"),
						eq(eventCausalityTable.triggeredEntityType, "DE"),
						eq(eventCausalityTable.triggeringDisasterEventId, itemId),
					),
				),
		]);

	const hazardousEventIds = Array.from(
		new Set(
			[...triggeringHeLinks, ...triggeredHeLinks]
				.map((row) => row.linkedId)
				.filter((id): id is string => Boolean(id)),
		),
	);

	const disasterEventIds = Array.from(
		new Set(
			[...triggeringDeLinks, ...triggeredDeLinks]
				.map((row) => row.linkedId)
				.filter((id): id is string => Boolean(id)),
		),
	);

	const [hazardousEvents, linkedDisasterEvents, linkedDisasterRecords] =
		await Promise.all([
			hazardousEventIds.length
				? dr.query.hazardousEventTable.findMany({
						columns: {
							id: true,
							description: true,
							startDate: true,
							endDate: true,
						},
						with: {
							hipHazard: { columns: { name: true, code: true } },
							hipCluster: { columns: { name: true } },
							hipType: { columns: { name: true } },
						},
						where: and(
							eq(hazardousEventTable.countryAccountsId, countryAccountsId),
							inArray(hazardousEventTable.id, hazardousEventIds),
						),
					})
				: [],
			disasterEventIds.length
				? dr.query.disasterEventTable.findMany({
						columns: {
							id: true,
							nameNational: true,
							nameGlobalOrRegional: true,
							startDate: true,
							endDate: true,
						},
						with: {
							hipHazard: { columns: { name: true, code: true } },
							hipCluster: { columns: { name: true } },
							hipType: { columns: { name: true } },
						},
						where: and(
							eq(disasterEventTable.countryAccountsId, countryAccountsId),
							inArray(disasterEventTable.id, disasterEventIds),
						),
					})
				: [],
			dr.query.disasterRecordsTable.findMany({
				columns: { id: true, disasterEventId: true },
				with: {
					hipHazard: { columns: { name: true, code: true } },
					hipCluster: { columns: { name: true } },
					hipType: { columns: { name: true } },
				},
				where: and(
					eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
					eq(disasterRecordsTable.disasterEventId, itemId),
				),
				orderBy: [desc(disasterRecordsTable.updatedAt)],
			}),
		]);

	const divisionRows = hazardousEventIds.length
		? await dr
				.select({
					hazardousEventId: hazardousEventDivisionTable.hazardousEventId,
					divisionName: divisionTable.name,
				})
				.from(hazardousEventDivisionTable)
				.innerJoin(
					divisionTable,
					eq(hazardousEventDivisionTable.divisionId, divisionTable.id),
				)
				.where(
					and(
						inArray(
							hazardousEventDivisionTable.hazardousEventId,
							hazardousEventIds,
						),
						eq(divisionTable.countryAccountsId, countryAccountsId),
					),
				)
		: [];

	const disasterDivisionRows = disasterEventIds.length
		? await dr
				.select({
					disasterEventId: disasterEventDivisionTable.disasterEventId,
					divisionName: divisionTable.name,
				})
				.from(disasterEventDivisionTable)
				.innerJoin(
					divisionTable,
					eq(disasterEventDivisionTable.divisionId, divisionTable.id),
				)
				.where(
					and(
						inArray(disasterEventDivisionTable.disasterEventId, disasterEventIds),
						eq(divisionTable.countryAccountsId, countryAccountsId),
					),
				)
		: [];

	const divisionNamesByHazardousEventId = new Map<string, string[]>();
	for (const row of divisionRows) {
		const name = localizedName(row.divisionName, lang);
		if (!name) {
			continue;
		}

		const current = divisionNamesByHazardousEventId.get(row.hazardousEventId) || [];
		current.push(name);
		divisionNamesByHazardousEventId.set(row.hazardousEventId, current);
	}

	const divisionNamesByDisasterEventId = new Map<string, string[]>();
	for (const row of disasterDivisionRows) {
		const name = localizedName(row.divisionName, lang);
		if (!name) {
			continue;
		}

		const current = divisionNamesByDisasterEventId.get(row.disasterEventId) || [];
		current.push(name);
		divisionNamesByDisasterEventId.set(row.disasterEventId, current);
	}

	const hazardousById = new Map(
		hazardousEvents.map((event) => {
			const hazardName = localizedName(event.hipHazard?.name, lang);
			const clusterName = localizedName(event.hipCluster?.name, lang);
			const typeName = localizedName(event.hipType?.name, lang);

			return [
				event.id,
				{
					id: event.id,
					name: hazardName || clusterName || typeName,
					code: event.id,
					dateLabel: formatEventDateRange(event.startDate, event.endDate, lang),
					divisionNamesLabel: (
						divisionNamesByHazardousEventId.get(event.id) || []
					).join(", "),
				},
			] as const;
		}),
	);

	const disasterById = new Map(
		linkedDisasterEvents.map((event) => [
			event.id,
			formatDisasterEventLabel(
				event,
				lang,
				divisionNamesByDisasterEventId.get(event.id) || [],
			),
		]),
	);

	return {
		linkedTriggeringHazardousEvents: triggeringHeLinks
			.map((row) => (row.linkedId ? hazardousById.get(row.linkedId) : null))
			.filter((value): value is NonNullable<typeof value> => Boolean(value)),
		linkedTriggeredHazardousEvents: triggeredHeLinks
			.map((row) => (row.linkedId ? hazardousById.get(row.linkedId) : null))
			.filter((value): value is NonNullable<typeof value> => Boolean(value)),
		linkedTriggeringDisasterEvents: triggeringDeLinks
			.map((row) => (row.linkedId ? disasterById.get(row.linkedId) : null))
			.filter((value): value is NonNullable<typeof value> => Boolean(value)),
		linkedTriggeredDisasterEvents: triggeredDeLinks
			.map((row) => (row.linkedId ? disasterById.get(row.linkedId) : null))
			.filter((value): value is NonNullable<typeof value> => Boolean(value)),
		linkedDisasterRecords: linkedDisasterRecords.map((record) =>
			formatDisasterRecordLabel(record, lang),
		),
	};
}

export const loader = async (args: LoaderFunctionArgs) => {
	const { request, params } = args;

	const { id } = params;
	if (!id) {
		throw new Response("ID is required", { status: 400 });
	}

	const userSession = await optionalUser(args);
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const userId = userSession ? await getUserIdFromSession(request) : null;

	const loaderFunction = createViewLoaderPublicApproved({
		getById: disasterEventById,
	});

	const result = await loaderFunction(args);
	if (result.item.countryAccountsId !== countryAccountsId) {
		throw new Response("Unauthorized access", { status: 401 });
	}

	const disasterEventAttachments =
		await DisasterEventAttachmentRepository.getByDisasterEventId(
			result.item.id,
		);
	const disasterEventResponses =
		await DisasterEventResponseRepository.listByDisasterEventId(result.item.id);
	const disasterEventResponseAttachments =
		await DisasterEventResponseAttachmentRepository.listByDisasterEventId(
			result.item.id,
		);
	const disasterEventDeclarations =
		await DisasterEventDeclarationRepository.listByDisasterEventId(
			result.item.id,
		);
	const disasterEventAssessments =
		await DisasterEventAssessmentRepository.listByDisasterEventId(
			result.item.id,
		);
	const disasterEventAssessmentAttachments =
		await DisasterEventAssessmentAttachmentRepository.listByDisasterEventId(
			result.item.id,
		);
	const disasterEventAssessmentSectors =
		await DisasterEventAssessmentSectorRepository.listByDisasterEventAssessmentIds(
			disasterEventAssessments.map((assessment) => assessment.id),
		);
	const sectorIds = [
		...new Set(
			disasterEventAssessmentSectors
				.map((link) => String(link.sectorId ?? "").trim())
				.filter(Boolean),
		),
	];
	const assessmentSectorNamesById = Object.fromEntries(
		sectorIds.length === 0
			? []
			: (
					await dr
						.select({
							id: sectorTable.id,
							name: sql<string>`dts_jsonb_localized(${sectorTable.name}, ${params.lang ?? "en"})`.as(
								"name",
							),
						})
						.from(sectorTable)
						.where(inArray(sectorTable.id, sectorIds))
				).map((row) => [row.id, row.name]),
	);
	const disasterEventDeclarationAttachments =
		await DisasterEventDeclarationAttachmentRepository.listByDisasterEventId(
			result.item.id,
		);
	const disasterEventLinks =
		await DisasterEventLinkRepository.getByDisasterEventId(result.item.id);

	const returnAssignees =
		userSession && countryAccountsId
			? (await getReturnAssigneeUsers(countryAccountsId, userId)).map(
					(user) => ({
						label: `${user.firstName} ${user.lastName}`.trim(),
						value: user.id,
					}),
				)
			: [];

	const lang = typeof params.lang === "string" && params.lang ? params.lang : "en";
	const linkedViewData = await getLinkedViewData({
		itemId: result.item.id,
		countryAccountsId,
		lang,
	});

	return {
		...result,

		item: {
			...result.item,
			spatialFootprintsDataSource: [],
			attachments: disasterEventAttachments,
			responses: disasterEventResponses,
			responseAttachments: disasterEventResponseAttachments,
			assessments: disasterEventAssessments,
			assessmentAttachments: disasterEventAssessmentAttachments,
			assessmentSectors: disasterEventAssessmentSectors,
			assessmentSectorNamesById,
			declarations: disasterEventDeclarations,
			declarationAttachments: disasterEventDeclarationAttachments,
			links: disasterEventLinks,
			returnAssignees,
			linkedTriggeringHazardousEvents:
				linkedViewData.linkedTriggeringHazardousEvents,
			linkedTriggeredHazardousEvents:
				linkedViewData.linkedTriggeredHazardousEvents,
			linkedTriggeringDisasterEvents:
				linkedViewData.linkedTriggeringDisasterEvents,
			linkedTriggeredDisasterEvents:
				linkedViewData.linkedTriggeredDisasterEvents,
			linkedDisasterRecords: linkedViewData.linkedDisasterRecords,
		},
	};
};

export const action = authActionWithPerm("EditData", async (actionArgs) => {
	const { request, params } = actionArgs;

	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const userSession = authActionGetAuth(actionArgs);
	const formData = await request.formData();
	const ctx = new BackendContext(actionArgs);

	const result = await processApprovalStatusActionService({
		ctx,
		request,
		formData,
		routeRecordId: params.id,
		countryAccountsId,
		userId: userSession.user.id,
		recordType: "disaster_event",
	});

	return Response.json(result);
});

export default function Screen() {
	const ld = useLoaderData<typeof loader>();
	const ctx = new ViewContext();
	if (!ld.item) {
		throw new Error("no item");
	}
	return (
		<>
			<ViewScreenPublicApproved
				loaderData={ld}
				ctx={ctx}
				viewComponent={DisasterEventView}
			/>
		</>
	);
}
