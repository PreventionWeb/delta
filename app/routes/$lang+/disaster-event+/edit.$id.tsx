// Import necessary modules
import {
	disasterEventById,
	disasterEventCreate,
	disasterEventUpdate,
} from "~/backend.server/models/event";
import { disasterRecordsUpdate } from "~/backend.server/models/disaster_record";

import { fieldsDef } from "~/frontend/events/disastereventform";

import { formSave } from "~/backend.server/handlers/form/form";

import { route } from "~/frontend/events/disastereventform";

import { useActionData, useLoaderData } from "react-router";

import { getItem2 } from "~/backend.server/handlers/view";
import { dataForHazardPicker } from "~/backend.server/models/hip_hazard_picker";
import {
	authActionGetAuth,
	authActionWithPerm,
	authLoaderGetUserForFrontend,
	authLoaderWithPerm,
} from "~/utils/auth";
import {
	getCountryAccountsIdFromSession,
	getCountrySettingsFromSession,
	getUserIdFromSession,
	getUserRoleFromSession,
} from "~/utils/session";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { dr } from "~/db.server";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { disasterRecordsTable } from "~/drizzle/schema/disasterRecordsTable";
import { eventCausalityTable } from "~/drizzle/schema/eventCausalityTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { hazardousEventDivisionTable } from "~/drizzle/schema/hazardousEventDivisionTable";
import { organizationTable } from "~/drizzle/schema/organizationTable";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { buildTree } from "~/components/TreeView";
import DisasterEventForm from "~/frontend/disaster-event/DisasterEventForm";

import { ViewContext } from "~/frontend/context";

import { BackendContext } from "~/backend.server/context";
import {
	getUserCountryAccountsWithAdminRole,
	getUserCountryAccountsWithValidatorRole,
} from "~/db/queries/userCountryAccountsRepository";
import { DeclarationStatusRepository } from "~/db/queries/declarationStatusRepository";
import { AssessmentTypeRepository } from "~/db/queries/assessmentTypeRepository";
import { DisasterEventAttachmentRepository } from "~/db/queries/disasterEventAttachmentRepository";
import { DisasterEventAssessmentAttachmentRepository } from "~/db/queries/disasterEventAssessmentAttachmentRepository";
import { DisasterEventAssessmentRepository } from "~/db/queries/disasterEventAssessmentRepository";
import { DisasterEventAssessmentSectorRepository } from "~/db/queries/disasterEventAssessmentSectorRepository";
import { DisasterEventDeclarationAttachmentRepository } from "~/db/queries/disasterEventDeclarationAttachmentRepository";
import { DisasterEventDeclarationRepository } from "~/db/queries/disasterEventDeclarationRepository";
import { DisasterEventLinkRepository } from "~/db/queries/disasterEventLinkRepository";
import { DisasterEventResponseAttachmentRepository } from "~/db/queries/disasterEventResponseAttachmentRepository";
import { DisasterEventResponseRepository } from "~/db/queries/disasterEventResponseRepository";
import { ResponseTypeRepository } from "~/db/queries/responseTypeRepository";
import { handleApprovalWorkflowService } from "~/backend.server/services/approvalWorkflowService";
import { canEditDataCollectionRecord } from "~/frontend/user/roles";
import { ContentRepeaterUploadFile } from "~/components/ContentRepeater/UploadFile";
import { TEMP_UPLOAD_PATH } from "~/utils/paths";
import { sectorTable } from "~/drizzle/schema/sectorTable";

export const handle = {
	hideMainNavigation: true,
};

// Helper function to get country ISO3 code
async function getCountryIso3(request: Request): Promise<string> {
	const settings = await getCountrySettingsFromSession(request);
	return settings?.dtsInstanceCtryIso3 || "";
}

// Helper function to get division GeoJSON data filtered by tenant context
async function getDivisionGeoJSON(countryAccountsId: string) {
	// Filter top-level divisions by tenant context
	return await dr
		.select({
			id: divisionTable.id,
			name: divisionTable.name,
			geojson: divisionTable.geojson,
		})
		.from(divisionTable)
		.where(
			and(
				isNull(divisionTable.parentId),
				isNotNull(divisionTable.geojson),
				eq(divisionTable.countryAccountsId, countryAccountsId),
			),
		);
}

async function getDivisionTreeData(countryAccountsId: string) {
	const idKey = "id";
	const parentKey = "parentId";
	const nameKey = "name";

	const rawData = await dr
		.select({
			id: divisionTable.id,
			parentId: divisionTable.parentId,
			name: divisionTable.name,
			importId: divisionTable.importId,
			nationalId: divisionTable.nationalId,
			level: divisionTable.level,
		})
		.from(divisionTable)
		.where(sql`country_accounts_id = ${countryAccountsId}`);

	return buildTree(rawData, idKey, parentKey, nameKey, "en", [
		"importId",
		"nationalId",
		"level",
		"name",
	]);
}

async function getSectorOptions(lang: string): Promise<SectorOption[]> {
	const rows = await dr
		.select({
			id: sectorTable.id,
			parentId: sectorTable.parentId,
			name: sql<string>`dts_jsonb_localized(${sectorTable.name}, ${lang})`.as(
				"name",
			),
		})
		.from(sectorTable)
		.orderBy(sql`name`);

	return rows;
}

type SelectedDivisionPayload = {
	key: string;
	label: string;
};

type DisasterEventResponsePayload = {
	id?: string;
	type: string;
	responseDate?: string;
	coverage?: string;
	description?: string;
	attachments?: Array<{
		id?: string;
		title?: string;
		fileKey?: string;
		fileName: string;
		fileType: string;
		fileSize: number;
		tempFilePath?: string;
		tenantPath?: string;
	}>;
};

type DisasterEventDeclarationPayload = {
	id?: string;
	type?: string;
	declarationDate?: string;
	coverage?: string;
	effects?: string;
	issuingOrganization?: string;
	declarationStatusId?: string;
	declarationStatus?: string;
	attachments?: Array<{
		id?: string;
		title?: string;
		fileKey?: string;
		fileName: string;
		fileType: string;
		fileSize: number;
		tempFilePath?: string;
		tenantPath?: string;
	}>;
};

type DisasterEventAssessmentPayload = {
	id?: string;
	type?: string;
	assessmentTypeId?: string;
	assessmentDate?: string;
	coverage?: string;
	description?: string;
	otherSectors?: string;
	sectorIds?: string[];
	attachments?: Array<{
		id?: string;
		title?: string;
		fileKey?: string;
		fileName: string;
		fileType: string;
		fileSize: number;
		tempFilePath?: string;
		tenantPath?: string;
	}>;
};

type SectorOption = {
	id: string;
	parentId: string | null;
	name: string;
};

function normalizeResponseTypeKey(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function parseResponseDateFromSubmit(value: string | undefined): Date | null {
	const trimmed = (value ?? "").trim();
	if (!trimmed) {
		return null;
	}

	const parsed = new Date(`${trimmed}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	return parsed;
}

function parseDeclarationDateFromSubmit(
	value: string | undefined,
): Date | null {
	const trimmed = (value ?? "").trim();
	if (!trimmed) {
		return null;
	}

	const parsed = new Date(`${trimmed}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	return parsed;
}

function parseAssessmentDateFromSubmit(value: string | undefined): Date | null {
	const trimmed = (value ?? "").trim();
	if (!trimmed) {
		return null;
	}

	const parsed = new Date(`${trimmed}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	return parsed;
}

async function buildGeographicLevelSpatialFootprint(
	tx: Parameters<Parameters<typeof formSave>[0]["save"]>[0],
	countryAccountsId: string,
	lang: string,
	selectedDivisionItems: SelectedDivisionPayload[],
) {
	if (selectedDivisionItems.length === 0) {
		return [] as any[];
	}

	const selectedIds = Array.from(
		new Set(
			selectedDivisionItems
				.map((item) => item.key)
				.filter((value): value is string => value.trim().length > 0),
		),
	);

	if (selectedIds.length === 0) {
		return [] as any[];
	}

	const divisionRows = await tx
		.select({
			id: divisionTable.id,
			name: divisionTable.name,
			geojson: divisionTable.geojson,
			importId: divisionTable.importId,
			nationalId: divisionTable.nationalId,
			level: divisionTable.level,
		})
		.from(divisionTable)
		.where(
			and(
				eq(divisionTable.countryAccountsId, countryAccountsId),
				inArray(divisionTable.id, selectedIds),
			),
		);

	const byId = new Map(divisionRows.map((row) => [row.id, row]));

	return selectedDivisionItems
		.map((item) => {
			const division = byId.get(item.key);
			if (!division) {
				return null;
			}

			const nameObject = division.name as Record<string, string> | null;
			const localizedName =
				(nameObject &&
					String(
						nameObject[lang] ||
							nameObject.en ||
							Object.values(nameObject)[0] ||
							"",
					).trim()) ||
				item.label ||
				item.key;

			const rawGeojson = division.geojson as any;
			let featureGeojson: any;
			if (rawGeojson?.type === "Feature") {
				featureGeojson = rawGeojson;
			} else if (
				rawGeojson?.type === "FeatureCollection" &&
				Array.isArray(rawGeojson.features) &&
				rawGeojson.features[0]
			) {
				featureGeojson = rawGeojson.features[0];
			} else {
				featureGeojson = {
					type: "Feature",
					geometry: rawGeojson,
					properties: {},
				};
			}

			featureGeojson.properties = {
				...(featureGeojson.properties || {}),
				division_id: division.id,
				division_ids: [division.id],
				import_id: division.importId,
				national_id: division.nationalId,
				level: division.level,
				name: division.name,
			};

			return {
				id: `geographic-${division.id}`,
				title: localizedName,
				map_option: "Geographic level",
				geographic_level: item.label || localizedName,
				geojson: featureGeojson,
			};
		})
		.filter((item): item is any => Boolean(item));
}

async function getUsersEligibleForValidation(
	countryAccountsId: string,
	userId: string | undefined,
) {
	const usersWithValidatorRole =
		await getUserCountryAccountsWithValidatorRole(countryAccountsId);

	let filteredUsersWithValidatorRole = usersWithValidatorRole.filter(
		(userAccount) => userAccount.id !== userId,
	);

	if (filteredUsersWithValidatorRole.length === 0) {
		const usersWithAdminRole =
			await getUserCountryAccountsWithAdminRole(countryAccountsId);
		filteredUsersWithValidatorRole = usersWithAdminRole.filter(
			(userAccount) => userAccount.id !== userId,
		);
	}

	return filteredUsersWithValidatorRole;
}

async function getCurrentUserOrganization(
	userId: string | undefined,
	countryAccountsId: string,
) {
	if (!userId) {
		return null;
	}

	return dr.query.userCountryAccountsTable.findFirst({
		where: and(
			eq(userCountryAccountsTable.userId, userId),
			eq(userCountryAccountsTable.countryAccountsId, countryAccountsId),
		),
		columns: {
			organizationId: true,
		},
		with: {
			organization: {
				columns: {
					id: true,
					name: true,
				},
			},
		},
	});
}

async function getRecordingOrganization(
	recordingOrganizationId?: string | null,
) {
	if (!recordingOrganizationId) {
		return null;
	}

	return dr.query.organizationTable.findFirst({
		columns: {
			id: true,
			name: true,
		},
		where: eq(organizationTable.id, recordingOrganizationId),
	});
}

function formatDisasterEventDisplayName(
	event: {
		id: string;
		nameNational: string | null;
		nameGlobalOrRegional: string | null;
		hipHazard: {
			name: Record<string, string> | null;
			code: string | null;
		} | null;
		hipCluster: {
			name: Record<string, string> | null;
		} | null;
		hipType: {
			name: Record<string, string> | null;
		} | null;
	},
	lang: string,
) {
	const displayName =
		event.nameNational?.trim() ||
		event.nameGlobalOrRegional?.trim() ||
		`DE: ${event.id.slice(0, 8)}`;
	const hazardName = localizedHipName(event.hipHazard?.name, lang);
	const clusterName = localizedHipName(event.hipCluster?.name, lang);
	const typeName = localizedHipName(event.hipType?.name, lang);
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
		code: `${event.id}`,
		hip: hipLabel,
	};
}

function localizedHipName(
	name: Record<string, string> | null | undefined,
	lang: string,
) {
	if (!name) {
		return "";
	}

	return String(name[lang] || name.en || Object.values(name)[0] || "").trim();
}

function formatHazardousEventDisplayName(
	event: {
		id: string;
		description: string | null;
		startDate: string | null;
		endDate: string | null;
		hipHazard: {
			code: string | null;
			name: Record<string, string> | null;
		} | null;
		hipCluster: {
			name: Record<string, string> | null;
		} | null;
		hipType: {
			name: Record<string, string> | null;
		} | null;
	},
	lang: string,
	divisionNames: string[],
) {
	const hazardName = localizedHipName(event.hipHazard?.name, lang);
	const clusterName = localizedHipName(event.hipCluster?.name, lang);
	const typeName = localizedHipName(event.hipType?.name, lang);

	const displayName = hazardName
		? event.hipHazard?.code
			? `${hazardName} (${event.hipHazard.code})`
			: hazardName
		: clusterName ||
			typeName ||
			event.description?.trim() ||
			`HE: ${event.id.slice(0, 8)}`;

	return {
		id: event.id,
		name: displayName,
		code: event.id,
		dateLabel: formatEventDateRange(event.startDate, event.endDate, lang),
		divisionNamesLabel: divisionNames.join(", "),
	};
}

function parseYmd(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	const trimmed = value.trim();
	const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
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

function formatDisasterRecordDisplayName(
	record: {
		id: string;
		hipHazard: {
			name: Record<string, string> | null;
			code: string | null;
		} | null;
		hipCluster: {
			name: Record<string, string> | null;
		} | null;
		hipType: {
			name: Record<string, string> | null;
		} | null;
	},
	lang: string,
) {
	const hazardName = localizedHipName(record.hipHazard?.name, lang);
	const clusterName = localizedHipName(record.hipCluster?.name, lang);
	const typeName = localizedHipName(record.hipType?.name, lang);
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

async function getLinkedHazardousData(
	countryAccountsId: string,
	lang: string,
	itemId: string,
	selectedHazardousEventId?: string | null,
) {
	const hazardousEvents = await dr.query.hazardousEventTable.findMany({
		columns: {
			id: true,
			description: true,
			startDate: true,
			endDate: true,
		},
		with: {
			hipHazard: {
				columns: {
					code: true,
					name: true,
				},
			},
			hipCluster: {
				columns: {
					name: true,
				},
			},
			hipType: {
				columns: {
					name: true,
				},
			},
		},
		where: eq(hazardousEventTable.countryAccountsId, countryAccountsId),
		orderBy: [desc(hazardousEventTable.updatedAt)],
	});

	const hazardousEventIds = hazardousEvents.map((event) => event.id);
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

	const divisionNamesByHazardousEventId = new Map<string, string[]>();
	for (const row of divisionRows) {
		const localizedDivisionName = localizedHipName(row.divisionName, lang);
		if (!localizedDivisionName) {
			continue;
		}

		const current = divisionNamesByHazardousEventId.get(row.hazardousEventId) || [];
		current.push(localizedDivisionName);
		divisionNamesByHazardousEventId.set(row.hazardousEventId, current);
	}

	const hazardousEventOptions = hazardousEvents.map((event) =>
		formatHazardousEventDisplayName(
			event,
			lang,
			divisionNamesByHazardousEventId.get(event.id) || [],
		),
	);
	const triggeringLinks = await dr
		.select({
			linkedId: eventCausalityTable.triggeringHazardousEventId,
		})
		.from(eventCausalityTable)
		.where(
			and(
				eq(eventCausalityTable.triggeringEntityType, "HE"),
				eq(eventCausalityTable.triggeredEntityType, "DE"),
				eq(eventCausalityTable.triggeredDisasterEventId, itemId),
			),
		);

	const triggeredLinks = await dr
		.select({
			linkedId: eventCausalityTable.triggeredHazardousEventId,
		})
		.from(eventCausalityTable)
		.where(
			and(
				eq(eventCausalityTable.triggeringEntityType, "DE"),
				eq(eventCausalityTable.triggeredEntityType, "HE"),
				eq(eventCausalityTable.triggeringDisasterEventId, itemId),
			),
		);

	const linkedTriggeringHazardousEvents = triggeringLinks
		.map((row) =>
			hazardousEventOptions.find((event) => event.id === row.linkedId),
		)
		.filter((event): event is (typeof hazardousEventOptions)[number] =>
			Boolean(event),
		);

	const linkedTriggeredHazardousEvents = triggeredLinks
		.map((row) =>
			hazardousEventOptions.find((event) => event.id === row.linkedId),
		)
		.filter((event): event is (typeof hazardousEventOptions)[number] =>
			Boolean(event),
		);

	if (selectedHazardousEventId) {
		const legacyLinked = hazardousEventOptions.find(
			(event) => event.id === selectedHazardousEventId,
		);
		if (
			legacyLinked &&
			!linkedTriggeredHazardousEvents.some(
				(event) => event.id === legacyLinked.id,
			)
		) {
			linkedTriggeredHazardousEvents.unshift(legacyLinked);
		}
	}

	return {
		hazardousEventOptions,
		linkedTriggeringHazardousEvents,
		linkedTriggeredHazardousEvents,
	};
}

async function getLinkedDisasterData(
	countryAccountsId: string,
	itemId: string,
	lang: string,
) {
	const disasterEvents = await dr.query.disasterEventTable.findMany({
		columns: {
			id: true,
			nameNational: true,
			nameGlobalOrRegional: true,
		},
		with: {
			hipHazard: {
				columns: {
					code: true,
					name: true,
				},
			},
			hipCluster: {
				columns: {
					name: true,
				},
			},
			hipType: {
				columns: {
					name: true,
				},
			},
		},
		where: eq(disasterEventTable.countryAccountsId, countryAccountsId),
		orderBy: [desc(disasterEventTable.updatedAt)],
	});

	const disasterEventOptions = disasterEvents
		.filter((event) => event.id !== itemId)
		.map((event) => formatDisasterEventDisplayName(event, lang));

	const disasterEventOptionsById = new Map(
		disasterEventOptions.map((event) => [event.id, event]),
	);

	const triggeringLinks = await dr
		.select({
			linkedId: eventCausalityTable.triggeringDisasterEventId,
		})
		.from(eventCausalityTable)
		.where(
			and(
				eq(eventCausalityTable.triggeringEntityType, "DE"),
				eq(eventCausalityTable.triggeredEntityType, "DE"),
				eq(eventCausalityTable.triggeredDisasterEventId, itemId),
			),
		);

	const triggeredLinks = await dr
		.select({
			linkedId: eventCausalityTable.triggeredDisasterEventId,
		})
		.from(eventCausalityTable)
		.where(
			and(
				eq(eventCausalityTable.triggeringEntityType, "DE"),
				eq(eventCausalityTable.triggeredEntityType, "DE"),
				eq(eventCausalityTable.triggeringDisasterEventId, itemId),
			),
		);

	const linkedTriggeringDisasterEvents = triggeringLinks
		.map((row) =>
			row.linkedId ? disasterEventOptionsById.get(row.linkedId) : null,
		)
		.filter((event): event is NonNullable<typeof event> => Boolean(event));

	const linkedTriggeredDisasterEvents = triggeredLinks
		.map((row) =>
			row.linkedId ? disasterEventOptionsById.get(row.linkedId) : null,
		)
		.filter((event): event is NonNullable<typeof event> => Boolean(event));

	const disasterRecords = await dr.query.disasterRecordsTable.findMany({
		columns: {
			id: true,
			disasterEventId: true,
		},
		with: {
			hipHazard: {
				columns: {
					name: true,
					code: true,
				},
			},
			hipCluster: {
				columns: {
					name: true,
				},
			},
			hipType: {
				columns: {
					name: true,
				},
			},
		},
		where: eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
		orderBy: [desc(disasterRecordsTable.updatedAt)],
	});

	const disasterRecordOptions = disasterRecords.map((record) =>
		formatDisasterRecordDisplayName(record, lang),
	);

	const linkedDisasterRecords = disasterRecords
		.filter((record) => record.disasterEventId === itemId)
		.map((record) => formatDisasterRecordDisplayName(record, lang));

	return {
		disasterEventOptions,
		linkedTriggeringDisasterEvents,
		linkedTriggeredDisasterEvents,
		disasterRecordOptions,
		linkedDisasterRecords,
	};
}

export const action = authActionWithPerm("EditData", async (actionArgs) => {
	const { request } = actionArgs;
	const cloned = request.clone();
	const formData = await cloned.formData();
	const ctx = new BackendContext(actionArgs);
	const userSession = authActionGetAuth(actionArgs);

	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const linkedDisasterRecordIdsRaw = String(
		formData.get("linkedDisasterRecordIds") ?? "[]",
	);
	const linkedTriggeringDisasterEventIdsRaw = String(
		formData.get("linkedTriggeringDisasterEventIds") ?? "[]",
	);
	const linkedTriggeredDisasterEventIdsRaw = String(
		formData.get("linkedTriggeredDisasterEventIds") ?? "[]",
	);
	const linkedHazardousEventIdsRaw = String(
		formData.get("linkedHazardousEventIds") ?? "[]",
	);
	const linkedTriggeringHazardousEventIdsRaw = String(
		formData.get("linkedTriggeringHazardousEventIds") ?? "[]",
	);
	const linkedTriggeredHazardousEventIdsRaw = String(
		formData.get("linkedTriggeredHazardousEventIds") ?? "[]",
	);
	const selectedDivisionItemsRaw = String(
		formData.get("selectedDivisionItems") ?? "[]",
	);
	const spatialFootprintRaw = String(formData.get("spatialFootprint") ?? "[]");
	const hasExistingAttachmentIdsField = formData.has("existingAttachmentIds");
	const existingAttachmentIdsRaw = String(
		formData.get("existingAttachmentIds") ?? "[]",
	);
	const hasNewAttachmentUploadsField = formData.has("newAttachmentUploads");
	const newAttachmentUploadsRaw = String(
		formData.get("newAttachmentUploads") ?? "[]",
	);
	const hasDisasterEventLinksField = formData.has("disasterEventLinks");
	const disasterEventLinksRaw = String(
		formData.get("disasterEventLinks") ?? "[]",
	);
	const disasterEventResponsesRaw = String(
		formData.get("disasterEventResponses") ?? "[]",
	);
	const disasterEventAssessmentsRaw = String(
		formData.get("disasterEventAssessments") ?? "[]",
	);
	const disasterEventDeclarationsRaw = String(
		formData.get("disasterEventDeclarations") ?? "[]",
	);
	let linkedDisasterRecordIds: string[] = [];
	let linkedTriggeringDisasterEventIds: string[] = [];
	let linkedTriggeredDisasterEventIds: string[] = [];
	let linkedTriggeringHazardousEventIds: string[] = [];
	let linkedTriggeredHazardousEventIds: string[] = [];
	let selectedDivisionItems: SelectedDivisionPayload[] = [];
	let spatialFootprintValue: any[] = [];
	let existingAttachmentIds: string[] = [];
	let newAttachmentUploads: Array<{
		fileName: string;
		fileType: string;
		fileSize: number;
		tempFilePath: string;
		tenantPath?: string;
	}> = [];
	let disasterEventLinks: Array<{
		url: string;
		title: string | null;
	}> = [];
	let disasterEventResponses: DisasterEventResponsePayload[] = [];
	let disasterEventAssessments: DisasterEventAssessmentPayload[] = [];
	let disasterEventDeclarations: DisasterEventDeclarationPayload[] = [];
	try {
		const parsed = JSON.parse(linkedDisasterRecordIdsRaw);
		linkedDisasterRecordIds = Array.isArray(parsed)
			? parsed.filter((value): value is string => typeof value === "string")
			: [];
	} catch {
		linkedDisasterRecordIds = [];
	}
	try {
		const parsed = JSON.parse(linkedTriggeringDisasterEventIdsRaw);
		linkedTriggeringDisasterEventIds = Array.isArray(parsed)
			? parsed.filter((value): value is string => typeof value === "string")
			: [];
	} catch {
		linkedTriggeringDisasterEventIds = [];
	}
	try {
		const parsed = JSON.parse(linkedTriggeredDisasterEventIdsRaw);
		linkedTriggeredDisasterEventIds = Array.isArray(parsed)
			? parsed.filter((value): value is string => typeof value === "string")
			: [];
	} catch {
		linkedTriggeredDisasterEventIds = [];
	}
	try {
		const parsed = JSON.parse(linkedTriggeringHazardousEventIdsRaw);
		linkedTriggeringHazardousEventIds = Array.isArray(parsed)
			? parsed.filter((value): value is string => typeof value === "string")
			: [];
	} catch {
		linkedTriggeringHazardousEventIds = [];
	}
	try {
		const parsed = JSON.parse(linkedTriggeredHazardousEventIdsRaw);
		linkedTriggeredHazardousEventIds = Array.isArray(parsed)
			? parsed.filter((value): value is string => typeof value === "string")
			: [];
	} catch {
		linkedTriggeredHazardousEventIds = [];
	}

	if (linkedTriggeredHazardousEventIds.length === 0) {
		try {
			const parsed = JSON.parse(linkedHazardousEventIdsRaw);
			linkedTriggeredHazardousEventIds = Array.isArray(parsed)
				? parsed.filter((value): value is string => typeof value === "string")
				: [];
		} catch {
			linkedTriggeredHazardousEventIds = [];
		}
	}
	try {
		const parsed = JSON.parse(selectedDivisionItemsRaw);
		selectedDivisionItems = Array.isArray(parsed)
			? parsed.filter(
					(value): value is SelectedDivisionPayload =>
						typeof value?.key === "string" && typeof value?.label === "string",
				)
			: [];
	} catch {
		selectedDivisionItems = [];
	}
	try {
		const parsed = JSON.parse(spatialFootprintRaw);
		spatialFootprintValue = Array.isArray(parsed) ? parsed : [];
	} catch {
		spatialFootprintValue = [];
	}
	try {
		const parsed = JSON.parse(existingAttachmentIdsRaw);
		existingAttachmentIds = Array.isArray(parsed)
			? parsed.filter((value): value is string => typeof value === "string")
			: [];
	} catch {
		existingAttachmentIds = [];
	}
	try {
		const parsed = JSON.parse(newAttachmentUploadsRaw);
		newAttachmentUploads = Array.isArray(parsed)
			? parsed.filter(
					(
						value,
					): value is {
						fileName: string;
						fileType: string;
						fileSize: number;
						tempFilePath: string;
						tenantPath?: string;
					} =>
						typeof value?.fileName === "string" &&
						typeof value?.fileType === "string" &&
						typeof value?.fileSize === "number" &&
						typeof value?.tempFilePath === "string",
				)
			: [];
	} catch {
		newAttachmentUploads = [];
	}
	try {
		const parsed = JSON.parse(disasterEventLinksRaw);
		disasterEventLinks = Array.isArray(parsed)
			? parsed
					.map((value) => {
						const rawUrl =
							typeof value?.url === "string" ? value.url.trim() : "";
						const rawTitle =
							typeof value?.title === "string" ? value.title.trim() : "";
						if (!rawUrl) {
							return null;
						}

						try {
							new URL(rawUrl);
						} catch {
							return null;
						}

						return {
							url: rawUrl,
							title: rawTitle.length > 0 ? rawTitle : null,
						};
					})
					.filter((value): value is { url: string; title: string | null } =>
						Boolean(value),
					)
			: [];
	} catch {
		disasterEventLinks = [];
	}
	try {
		const parsed = JSON.parse(disasterEventResponsesRaw);
		disasterEventResponses = Array.isArray(parsed)
			? parsed.filter(
					(value): value is DisasterEventResponsePayload =>
						typeof value?.type === "string" &&
						typeof value?.description === "string",
				)
			: [];
	} catch {
		disasterEventResponses = [];
	}
	try {
		const parsed = JSON.parse(disasterEventAssessmentsRaw);
		disasterEventAssessments = Array.isArray(parsed)
			? parsed.filter(
					(value): value is DisasterEventAssessmentPayload =>
						typeof value === "object" && value !== null,
				)
			: [];
	} catch {
		disasterEventAssessments = [];
	}
	try {
		const parsed = JSON.parse(disasterEventDeclarationsRaw);
		disasterEventDeclarations = Array.isArray(parsed)
			? parsed.filter(
					(value): value is DisasterEventDeclarationPayload =>
						typeof value === "object" && value !== null,
				)
			: [];
	} catch {
		disasterEventDeclarations = [];
	}

	return formSave({
		actionArgs,
		fieldsDef: fieldsDef(ctx),
		save: async (tx, id, data) => {
			const currentSpatial = Array.isArray(spatialFootprintValue)
				? spatialFootprintValue
				: [];
			const nonGeographicSpatial = currentSpatial.filter(
				(item: any) => item?.map_option !== "Geographic level",
			);
			const geographicSpatial = await buildGeographicLevelSpatialFootprint(
				tx,
				countryAccountsId,
				ctx.lang,
				selectedDivisionItems,
			);
			const spatialFootprint = [...nonGeographicSpatial, ...geographicSpatial];
			const updatedData = {
				...data,
				countryAccountsId,
				updatedByUserId: userSession.user.id,
				spatialFootprint,
			};

			const syncLinkedDisasterEvents = async (eventId: string) => {
				const selectedTriggeringIds = new Set(
					linkedTriggeringDisasterEventIds.filter((id) => id !== eventId),
				);
				const selectedTriggeredIds = new Set(
					linkedTriggeredDisasterEventIds.filter((id) => id !== eventId),
				);

				const formatConflictSummary = async (ids: string[]) => {
					if (ids.length === 0) {
						return "";
					}

					const rows = await tx
						.select({
							id: disasterEventTable.id,
							nameNational: disasterEventTable.nameNational,
							nameGlobalOrRegional: disasterEventTable.nameGlobalOrRegional,
						})
						.from(disasterEventTable)
						.where(
							and(
								eq(disasterEventTable.countryAccountsId, countryAccountsId),
								inArray(disasterEventTable.id, ids),
							),
						);

					const byId = new Map(rows.map((row) => [row.id, row]));
					return ids
						.map((id) => {
							const event = byId.get(id);
							const name =
								event?.nameNational?.trim() ||
								event?.nameGlobalOrRegional?.trim() ||
								`DE ${id.slice(0, 8)}`;
							return `${name} (${id.slice(0, 8)})`;
						})
						.join(", ");
				};

				const cycleErrorResult = async (
					messageCode: string,
					message: string,
					conflictIds: string[],
				) => {
					const conflictSummary = await formatConflictSummary(conflictIds);
					const detail = conflictSummary
						? ` ${ctx.t({
								code: "disaster_event.cycle_conflicts",
								msg: "Conflicting events:",
							})} ${conflictSummary}`
						: "";

					return {
						ok: false as const,
						errors: {
							fields: {},
							form: [
								ctx.t({
									code: messageCode,
									msg: message,
								}) + detail,
							],
						},
					};
				};

				const currentTriggeringRows = await tx
					.select({
						id: eventCausalityTable.id,
						linkedId: eventCausalityTable.triggeringDisasterEventId,
					})
					.from(eventCausalityTable)
					.where(
						and(
							eq(eventCausalityTable.triggeringEntityType, "DE"),
							eq(eventCausalityTable.triggeredEntityType, "DE"),
							eq(eventCausalityTable.triggeredDisasterEventId, eventId),
						),
					);

				const currentTriggeredRows = await tx
					.select({
						id: eventCausalityTable.id,
						linkedId: eventCausalityTable.triggeredDisasterEventId,
					})
					.from(eventCausalityTable)
					.where(
						and(
							eq(eventCausalityTable.triggeringEntityType, "DE"),
							eq(eventCausalityTable.triggeredEntityType, "DE"),
							eq(eventCausalityTable.triggeringDisasterEventId, eventId),
						),
					);

				const currentTriggeringIds = new Set(
					currentTriggeringRows
						.map((row) => row.linkedId)
						.filter((id): id is string => Boolean(id)),
				);
				const currentTriggeredIds = new Set(
					currentTriggeredRows
						.map((row) => row.linkedId)
						.filter((id): id is string => Boolean(id)),
				);

				const descendantsResult = await tx.execute(sql`
					WITH RECURSIVE descendants AS (
						SELECT ${eventCausalityTable.triggeredDisasterEventId} AS id
						FROM ${eventCausalityTable}
						INNER JOIN ${disasterEventTable}
							ON ${disasterEventTable.id} = ${eventCausalityTable.triggeredDisasterEventId}
						WHERE
							${eventCausalityTable.triggeringEntityType} = 'DE'
							AND ${eventCausalityTable.triggeredEntityType} = 'DE'
							AND ${eventCausalityTable.triggeringDisasterEventId} = ${eventId}
							AND ${disasterEventTable.countryAccountsId} = ${countryAccountsId}

						UNION

						SELECT ${eventCausalityTable.triggeredDisasterEventId} AS id
						FROM ${eventCausalityTable}
						INNER JOIN descendants
							ON ${eventCausalityTable.triggeringDisasterEventId} = descendants.id
						INNER JOIN ${disasterEventTable}
							ON ${disasterEventTable.id} = ${eventCausalityTable.triggeredDisasterEventId}
						WHERE
							${eventCausalityTable.triggeringEntityType} = 'DE'
							AND ${eventCausalityTable.triggeredEntityType} = 'DE'
							AND ${disasterEventTable.countryAccountsId} = ${countryAccountsId}
					)
					SELECT DISTINCT id
					FROM descendants
					WHERE id IS NOT NULL
				`);

				const descendantIds = new Set(
					descendantsResult.rows
						.map((row) => String((row as { id?: string | null }).id || ""))
						.filter(Boolean),
				);

				const invalidTriggeringIds = Array.from(selectedTriggeringIds).filter(
					(linkedEventId) =>
						linkedEventId === eventId || descendantIds.has(linkedEventId),
				);
				if (invalidTriggeringIds.length > 0) {
					return cycleErrorResult(
						"disaster_event.cycle_triggering_not_allowed",
						"Cannot save linked triggering disaster events because one or more selected events are already downstream of this event. This would create a cycle.",
						invalidTriggeringIds,
					);
				}

				const ancestorsResult = await tx.execute(sql`
					WITH RECURSIVE ancestors AS (
						SELECT ${eventCausalityTable.triggeringDisasterEventId} AS id
						FROM ${eventCausalityTable}
						INNER JOIN ${disasterEventTable}
							ON ${disasterEventTable.id} = ${eventCausalityTable.triggeringDisasterEventId}
						WHERE
							${eventCausalityTable.triggeringEntityType} = 'DE'
							AND ${eventCausalityTable.triggeredEntityType} = 'DE'
							AND ${eventCausalityTable.triggeredDisasterEventId} = ${eventId}
							AND ${disasterEventTable.countryAccountsId} = ${countryAccountsId}

						UNION

						SELECT ${eventCausalityTable.triggeringDisasterEventId} AS id
						FROM ${eventCausalityTable}
						INNER JOIN ancestors
							ON ${eventCausalityTable.triggeredDisasterEventId} = ancestors.id
						INNER JOIN ${disasterEventTable}
							ON ${disasterEventTable.id} = ${eventCausalityTable.triggeringDisasterEventId}
						WHERE
							${eventCausalityTable.triggeringEntityType} = 'DE'
							AND ${eventCausalityTable.triggeredEntityType} = 'DE'
							AND ${disasterEventTable.countryAccountsId} = ${countryAccountsId}
					)
					SELECT DISTINCT id
					FROM ancestors
					WHERE id IS NOT NULL
				`);

				const ancestorIds = new Set(
					ancestorsResult.rows
						.map((row) => String((row as { id?: string | null }).id || ""))
						.filter(Boolean),
				);

				const invalidTriggeredIds = Array.from(selectedTriggeredIds).filter(
					(linkedEventId) =>
						linkedEventId === eventId || ancestorIds.has(linkedEventId),
				);
				if (invalidTriggeredIds.length > 0) {
					return cycleErrorResult(
						"disaster_event.cycle_triggered_not_allowed",
						"Cannot save linked triggered disaster events because one or more selected events are already upstream of this event. This would create a cycle.",
						invalidTriggeredIds,
					);
				}

				for (const row of currentTriggeringRows) {
					if (row.linkedId && !selectedTriggeringIds.has(row.linkedId)) {
						await tx
							.delete(eventCausalityTable)
							.where(eq(eventCausalityTable.id, row.id));
					}
				}

				for (const row of currentTriggeredRows) {
					if (row.linkedId && !selectedTriggeredIds.has(row.linkedId)) {
						await tx
							.delete(eventCausalityTable)
							.where(eq(eventCausalityTable.id, row.id));
					}
				}

				for (const linkedEventId of selectedTriggeringIds) {
					if (currentTriggeringIds.has(linkedEventId)) {
						continue;
					}

					await tx.insert(eventCausalityTable).values({
						triggeringEntityType: "DE",
						triggeringDisasterEventId: linkedEventId,
						triggeredEntityType: "DE",
						triggeredDisasterEventId: eventId,
					});
				}

				for (const linkedEventId of selectedTriggeredIds) {
					if (currentTriggeredIds.has(linkedEventId)) {
						continue;
					}

					await tx.insert(eventCausalityTable).values({
						triggeringEntityType: "DE",
						triggeringDisasterEventId: eventId,
						triggeredEntityType: "DE",
						triggeredDisasterEventId: linkedEventId,
					});
				}

				return { ok: true as const };
			};
			const syncLinkedDisasterRecords = async (eventId: string) => {
				const selectedIds = new Set(linkedDisasterRecordIds);
				const recordsLinkedToCurrentEvent = await tx
					.select({ id: disasterRecordsTable.id })
					.from(disasterRecordsTable)
					.where(
						and(
							eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
							eq(disasterRecordsTable.disasterEventId, eventId),
						),
					);

				const currentLinkedIds = new Set(
					recordsLinkedToCurrentEvent.map((record) => record.id),
				);

				for (const linkedRecordId of linkedDisasterRecordIds) {
					const updateResult = await disasterRecordsUpdate(
						ctx,
						tx,
						linkedRecordId,
						{
							disasterEventId: eventId,
						},
						countryAccountsId,
					);
					if (updateResult.ok !== true) {
						throw new Error(
							`Failed to link disaster record ${linkedRecordId} to disaster event ${eventId}`,
						);
					}
				}

				for (const linkedRecordId of currentLinkedIds) {
					if (!selectedIds.has(linkedRecordId)) {
						const updateResult = await disasterRecordsUpdate(
							ctx,
							tx,
							linkedRecordId,
							{
								disasterEventId: null,
							},
							countryAccountsId,
						);
						if (updateResult.ok !== true) {
							throw new Error(
								`Failed to unlink disaster record ${linkedRecordId} from disaster event ${eventId}`,
							);
						}
					}
				}
			};

			const syncLinkedHazardousEvents = async (eventId: string) => {
				const selectedTriggeringIds = new Set(
					linkedTriggeringHazardousEventIds,
				);
				const selectedTriggeredIds = new Set(linkedTriggeredHazardousEventIds);

				const currentTriggeringRows = await tx
					.select({
						id: eventCausalityTable.id,
						linkedId: eventCausalityTable.triggeringHazardousEventId,
					})
					.from(eventCausalityTable)
					.where(
						and(
							eq(eventCausalityTable.triggeringEntityType, "HE"),
							eq(eventCausalityTable.triggeredEntityType, "DE"),
							eq(eventCausalityTable.triggeredDisasterEventId, eventId),
						),
					);

				const currentTriggeredRows = await tx
					.select({
						id: eventCausalityTable.id,
						linkedId: eventCausalityTable.triggeredHazardousEventId,
					})
					.from(eventCausalityTable)
					.where(
						and(
							eq(eventCausalityTable.triggeringEntityType, "DE"),
							eq(eventCausalityTable.triggeredEntityType, "HE"),
							eq(eventCausalityTable.triggeringDisasterEventId, eventId),
						),
					);

				const currentTriggeringIds = new Set(
					currentTriggeringRows
						.map((row) => row.linkedId)
						.filter((id): id is string => Boolean(id)),
				);
				const currentTriggeredIds = new Set(
					currentTriggeredRows
						.map((row) => row.linkedId)
						.filter((id): id is string => Boolean(id)),
				);

				for (const row of currentTriggeringRows) {
					if (row.linkedId && !selectedTriggeringIds.has(row.linkedId)) {
						await tx
							.delete(eventCausalityTable)
							.where(eq(eventCausalityTable.id, row.id));
					}
				}

				for (const row of currentTriggeredRows) {
					if (row.linkedId && !selectedTriggeredIds.has(row.linkedId)) {
						await tx
							.delete(eventCausalityTable)
							.where(eq(eventCausalityTable.id, row.id));
					}
				}

				for (const linkedHazardousEventId of selectedTriggeringIds) {
					if (currentTriggeringIds.has(linkedHazardousEventId)) {
						continue;
					}

					await tx.insert(eventCausalityTable).values({
						triggeringEntityType: "HE",
						triggeringHazardousEventId: linkedHazardousEventId,
						triggeredEntityType: "DE",
						triggeredDisasterEventId: eventId,
					});
				}

				for (const linkedHazardousEventId of selectedTriggeredIds) {
					if (currentTriggeredIds.has(linkedHazardousEventId)) {
						continue;
					}

					await tx.insert(eventCausalityTable).values({
						triggeringEntityType: "DE",
						triggeringDisasterEventId: eventId,
						triggeredEntityType: "HE",
						triggeredHazardousEventId: linkedHazardousEventId,
					});
				}
			};

			const syncDisasterEventAttachments = async (eventId: string) => {
				if (hasExistingAttachmentIdsField) {
					const existingAttachmentsBeforeDelete =
						await DisasterEventAttachmentRepository.getByDisasterEventId(
							eventId,
							tx,
						);
					const keepIds = new Set(existingAttachmentIds);
					const attachmentsToDelete = existingAttachmentsBeforeDelete.filter(
						(attachment) => keepIds.has(attachment.id) === false,
					);

					await DisasterEventAttachmentRepository.deleteByDisasterEventIdExceptAttachmentIds(
						eventId,
						existingAttachmentIds,
						tx,
					);

					if (attachmentsToDelete.length > 0) {
						ContentRepeaterUploadFile.delete(
							attachmentsToDelete.map((attachment) => ({
								file: {
									name: attachment.fileKey,
								},
							})),
							undefined,
							countryAccountsId,
						);
					}
				}

				if (
					!hasNewAttachmentUploadsField ||
					newAttachmentUploads.length === 0
				) {
					return;
				}

				const existingAttachmentsAfterSync =
					await DisasterEventAttachmentRepository.getByDisasterEventId(
						eventId,
						tx,
					);

				const savePath = `/uploads/disaster-event/${eventId}`;
				const existingItems = existingAttachmentsAfterSync.map(
					(attachment) => ({
						file: {
							name: attachment.fileKey,
							content_type: attachment.fileType,
						},
					}),
				);
				const newItems = newAttachmentUploads.map((upload) => ({
					file: {
						name: upload.tempFilePath,
						content_type: upload.fileType,
						tenantPath: upload.tenantPath,
					},
				}));
				const itemsToMove = [...existingItems, ...newItems];

				const movedItems = ContentRepeaterUploadFile.save(
					itemsToMove,
					TEMP_UPLOAD_PATH,
					savePath,
					undefined,
					countryAccountsId,
				);

				const movedNewItems = movedItems.slice(existingItems.length);
				const newAttachmentRows = movedNewItems
					.map(
						(
							item: { file?: { name?: string; content_type?: string } },
							index: number,
						) => ({
							disasterEventId: eventId,
							fileKey: String(item?.file?.name ?? ""),
							fileName: newAttachmentUploads[index]?.fileName ?? "",
							fileType:
								newAttachmentUploads[index]?.fileType ||
								String(item?.file?.content_type ?? ""),
							fileSize: Number(newAttachmentUploads[index]?.fileSize ?? 0),
						}),
					)
					.filter(
						(row: { fileKey: string; fileName: string }) =>
							row.fileKey.length > 0 && row.fileName.length > 0,
					);

				if (newAttachmentRows.length > 0) {
					await DisasterEventAttachmentRepository.createMany(
						newAttachmentRows,
						tx,
					);
				}
			};

			const syncDisasterEventLinks = async (eventId: string) => {
				if (!hasDisasterEventLinksField) {
					return;
				}

				await DisasterEventLinkRepository.deleteByDisasterEventId(eventId, tx);

				if (disasterEventLinks.length === 0) {
					return;
				}

				await DisasterEventLinkRepository.createMany(
					disasterEventLinks.map((link) => ({
						disasterEventId: eventId,
						url: link.url,
						title: link.title,
					})),
					tx,
				);
			};

			const syncDisasterEventResponses = async (eventId: string) => {
				const responseTypes = await ResponseTypeRepository.listAll(tx);
				const existingResponses =
					await DisasterEventResponseRepository.listByDisasterEventId(
						eventId,
						tx,
					);
				const existingResponseIds = existingResponses.map((row) => row.id);
				const existingAttachments =
					await DisasterEventResponseAttachmentRepository.listByDisasterEventId(
						eventId,
						tx,
					);
				const keptExistingFileKeys = new Set<string>();

				await DisasterEventResponseRepository.deleteByDisasterEventId(
					eventId,
					tx,
				);
				if (existingResponseIds.length > 0) {
					await DisasterEventResponseAttachmentRepository.deleteByDisasterEventResponseIds(
						existingResponseIds,
						tx,
					);
				}

				for (const item of disasterEventResponses) {
					const submittedType = String(item.type ?? "").trim();
					const matchedResponseType = responseTypes.find((responseType) => {
						if (responseType.type === submittedType) {
							return true;
						}

						return (
							normalizeResponseTypeKey(responseType.type) === submittedType
						);
					});
					const responseTypeId = matchedResponseType?.id;
					if (!responseTypeId) {
						continue;
					}

					const description = String(item.description ?? "").trim();
					const coverage = String(item.coverage ?? "").trim();
					const responseDate = parseResponseDateFromSubmit(item.responseDate);
					const attachments = Array.isArray(item.attachments)
						? item.attachments
						: [];
					if (
						!description &&
						!coverage &&
						!responseDate &&
						attachments.length === 0
					) {
						continue;
					}

					const createdResponse =
						await DisasterEventResponseRepository.createOne(
							{
								disasterEventId: eventId,
								responseTypeId,
								responseDate,
								coverage: coverage || null,
								description: description || null,
							},
							tx,
						);
					if (!createdResponse) {
						continue;
					}

					const existingAttachmentPayloads = attachments.filter(
						(attachment) =>
							typeof attachment.fileKey === "string" &&
							attachment.fileKey.trim().length > 0 &&
							(!attachment.tempFilePath ||
								attachment.tempFilePath.trim().length === 0),
					);
					for (const existingAttachment of existingAttachmentPayloads) {
						keptExistingFileKeys.add(String(existingAttachment.fileKey));
					}

					const newAttachmentPayloads = attachments.filter(
						(attachment) =>
							typeof attachment.tempFilePath === "string" &&
							attachment.tempFilePath.trim().length > 0,
					);

					let movedNewItems: Array<{
						file?: { name?: string; content_type?: string };
					}> = [];
					if (newAttachmentPayloads.length > 0) {
						const savePath = `/uploads/disaster-event/${eventId}/responses/${createdResponse.id}`;
						movedNewItems = ContentRepeaterUploadFile.save(
							newAttachmentPayloads.map((upload) => ({
								file: {
									name: upload.tempFilePath,
									content_type: upload.fileType,
									tenantPath: upload.tenantPath,
								},
							})),
							TEMP_UPLOAD_PATH,
							savePath,
							undefined,
							countryAccountsId,
						);
					}

					const attachmentRows = [
						...existingAttachmentPayloads.map((attachment) => ({
							disasterEventResponseId: createdResponse.id,
							title: String(
								attachment.title ?? attachment.fileName ?? "",
							).trim(),
							fileKey: String(attachment.fileKey ?? ""),
							fileName: String(attachment.fileName ?? ""),
							fileType: String(attachment.fileType ?? ""),
							fileSize: Number(attachment.fileSize ?? 0),
						})),
						...movedNewItems.map((item, index) => {
							const source = newAttachmentPayloads[index];
							return {
								disasterEventResponseId: createdResponse.id,
								title: String(source?.title ?? source?.fileName ?? "").trim(),
								fileKey: String(item?.file?.name ?? ""),
								fileName: String(source?.fileName ?? ""),
								fileType:
									String(source?.fileType ?? "") ||
									String(item?.file?.content_type ?? ""),
								fileSize: Number(source?.fileSize ?? 0),
							};
						}),
					].filter(
						(row) =>
							row.fileKey.length > 0 &&
							row.fileName.length > 0 &&
							row.title.length > 0,
					);

					if (attachmentRows.length > 0) {
						await DisasterEventResponseAttachmentRepository.createMany(
							attachmentRows,
							tx,
						);
					}
				}

				const orphanedAttachments = existingAttachments.filter(
					(attachment) =>
						keptExistingFileKeys.has(String(attachment.fileKey)) === false,
				);
				if (orphanedAttachments.length > 0) {
					ContentRepeaterUploadFile.delete(
						orphanedAttachments.map((attachment) => ({
							file: {
								name: attachment.fileKey,
							},
						})),
						undefined,
						countryAccountsId,
					);
					ContentRepeaterUploadFile.deleteEmptyParentDirectoriesForFiles(
						orphanedAttachments.map((attachment) => ({
							file: {
								name: attachment.fileKey,
							},
						})),
						undefined,
						countryAccountsId,
					);
				}
			};

			const syncDisasterEventAssessments = async (eventId: string) => {
				const assessmentTypes = await AssessmentTypeRepository.listAll(tx);
				const assessmentTypeById = new Map(
					assessmentTypes.map((row) => [row.id, row]),
				);
				const assessmentTypeByName = new Map(
					assessmentTypes.map((row) => [row.type, row]),
				);

				const existingAssessments =
					await DisasterEventAssessmentRepository.listByDisasterEventId(
						eventId,
						tx,
					);
				const existingAssessmentIds = existingAssessments.map((row) => row.id);
				const existingAttachments =
					await DisasterEventAssessmentAttachmentRepository.listByDisasterEventId(
						eventId,
						tx,
					);
				const keptExistingFileKeys = new Set<string>();

				await DisasterEventAssessmentRepository.deleteByDisasterEventId(
					eventId,
					tx,
				);
				if (existingAssessmentIds.length > 0) {
					await DisasterEventAssessmentSectorRepository.deleteByDisasterEventAssessmentIds(
						existingAssessmentIds,
						tx,
					);
					await DisasterEventAssessmentAttachmentRepository.deleteByDisasterEventAssessmentIds(
						existingAssessmentIds,
						tx,
					);
				}

				const sectorRows = await tx
					.select({ id: sectorTable.id, parentId: sectorTable.parentId })
					.from(sectorTable);
				const sectorParentMap = new Map(
					sectorRows.map((row) => [row.id, row.parentId]),
				);

				const filterParentOnlySectorIds = (sectorIds: string[]) => {
					const selected = new Set(
						sectorIds
							.map((value) => value.trim())
							.filter((value) => value.length > 0),
					);
					const result: string[] = [];

					for (const sectorId of selected) {
						let parentId = sectorParentMap.get(sectorId) ?? null;
						let hasSelectedAncestor = false;
						while (parentId) {
							if (selected.has(parentId)) {
								hasSelectedAncestor = true;
								break;
							}
							parentId = sectorParentMap.get(parentId) ?? null;
						}

						if (!hasSelectedAncestor) {
							result.push(sectorId);
						}
					}

					return result;
				};

				for (const item of disasterEventAssessments) {
					const submittedType = String(item.type ?? "").trim();
					const submittedTypeId = String(item.assessmentTypeId ?? "").trim();
					const matchedAssessmentType =
						assessmentTypeById.get(submittedTypeId) ??
						assessmentTypeByName.get(submittedType);
					const assessmentTypeId = matchedAssessmentType?.id;
					if (!assessmentTypeId) {
						continue;
					}

					const description = String(item.description ?? "").trim();
					const coverage = String(item.coverage ?? "").trim();
					const otherSectors = String(item.otherSectors ?? "").trim();
					const assessmentDate = parseAssessmentDateFromSubmit(
						item.assessmentDate,
					);
					const attachments = Array.isArray(item.attachments)
						? item.attachments
						: [];
					const sectorIds = Array.isArray(item.sectorIds)
						? filterParentOnlySectorIds(
								item.sectorIds.filter(
									(value): value is string => typeof value === "string",
								),
							)
						: [];

					if (
						!description &&
						!coverage &&
						!otherSectors &&
						!assessmentDate &&
						attachments.length === 0 &&
						sectorIds.length === 0
					) {
						continue;
					}

					const createdAssessment =
						await DisasterEventAssessmentRepository.createOne(
							{
								disasterEventId: eventId,
								assessmentTypeId,
								coverage: coverage || null,
								assessmentDate,
								description: description || null,
								otherSectors: otherSectors || null,
							},
							tx,
						);
					if (!createdAssessment) {
						continue;
					}

					if (sectorIds.length > 0) {
						await DisasterEventAssessmentSectorRepository.createMany(
							sectorIds.map((sectorId) => ({
								disasterEventAssessmentId: createdAssessment.id,
								sectorId,
							})),
							tx,
						);
					}

					const existingAttachmentPayloads = attachments.filter(
						(attachment) =>
							typeof attachment.fileKey === "string" &&
							attachment.fileKey.trim().length > 0 &&
							(!attachment.tempFilePath ||
								attachment.tempFilePath.trim().length === 0),
					);
					for (const existingAttachment of existingAttachmentPayloads) {
						keptExistingFileKeys.add(String(existingAttachment.fileKey));
					}

					const newAttachmentPayloads = attachments.filter(
						(attachment) =>
							typeof attachment.tempFilePath === "string" &&
							attachment.tempFilePath.trim().length > 0,
					);

					let movedNewItems: Array<{
						file?: { name?: string; content_type?: string };
					}> = [];
					if (newAttachmentPayloads.length > 0) {
						const savePath = `/uploads/disaster-event/${eventId}/assessments/${createdAssessment.id}`;
						movedNewItems = ContentRepeaterUploadFile.save(
							newAttachmentPayloads.map((upload) => ({
								file: {
									name: upload.tempFilePath,
									content_type: upload.fileType,
									tenantPath: upload.tenantPath,
								},
							})),
							TEMP_UPLOAD_PATH,
							savePath,
							undefined,
							countryAccountsId,
						);
					}

					const attachmentRows = [
						...existingAttachmentPayloads.map((attachment) => ({
							disasterEventAssessmentId: createdAssessment.id,
							title: String(
								attachment.title ?? attachment.fileName ?? "",
							).trim(),
							fileKey: String(attachment.fileKey ?? ""),
							fileName: String(attachment.fileName ?? ""),
							fileType: String(attachment.fileType ?? ""),
							fileSize: Number(attachment.fileSize ?? 0),
						})),
						...movedNewItems.map((item, index) => {
							const source = newAttachmentPayloads[index];
							return {
								disasterEventAssessmentId: createdAssessment.id,
								title: String(source?.title ?? source?.fileName ?? "").trim(),
								fileKey: String(item?.file?.name ?? ""),
								fileName: String(source?.fileName ?? ""),
								fileType:
									String(source?.fileType ?? "") ||
									String(item?.file?.content_type ?? ""),
								fileSize: Number(source?.fileSize ?? 0),
							};
						}),
					].filter(
						(row) =>
							row.fileKey.length > 0 &&
							row.fileName.length > 0 &&
							row.title.length > 0,
					);

					if (attachmentRows.length > 0) {
						await DisasterEventAssessmentAttachmentRepository.createMany(
							attachmentRows,
							tx,
						);
					}
				}

				const orphanedAttachments = existingAttachments.filter(
					(attachment) =>
						keptExistingFileKeys.has(String(attachment.fileKey)) === false,
				);
				if (orphanedAttachments.length > 0) {
					ContentRepeaterUploadFile.delete(
						orphanedAttachments.map((attachment) => ({
							file: {
								name: attachment.fileKey,
							},
						})),
						undefined,
						countryAccountsId,
					);
					ContentRepeaterUploadFile.deleteEmptyParentDirectoriesForFiles(
						orphanedAttachments.map((attachment) => ({
							file: {
								name: attachment.fileKey,
							},
						})),
						undefined,
						countryAccountsId,
					);
				}
			};

			const syncDisasterEventDeclarations = async (eventId: string) => {
				const declarationStatuses =
					await DeclarationStatusRepository.listAll(tx);
				const declarationStatusById = new Map(
					declarationStatuses.map((row) => [row.id, row]),
				);
				const declarationStatusByName = new Map(
					declarationStatuses.map((row) => [row.status, row]),
				);

				const existingDeclarations =
					await DisasterEventDeclarationRepository.listByDisasterEventId(
						eventId,
						tx,
					);
				const existingDeclarationIds = existingDeclarations.map(
					(row) => row.id,
				);
				const existingAttachments =
					await DisasterEventDeclarationAttachmentRepository.listByDisasterEventId(
						eventId,
						tx,
					);
				const keptExistingFileKeys = new Set<string>();

				await DisasterEventDeclarationRepository.deleteByDisasterEventId(
					eventId,
					tx,
				);
				if (existingDeclarationIds.length > 0) {
					await DisasterEventDeclarationAttachmentRepository.deleteByDisasterEventDeclarationIds(
						existingDeclarationIds,
						tx,
					);
				}

				for (const item of disasterEventDeclarations) {
					const type = String(item.type ?? "").trim();
					const effects = String(item.effects ?? "").trim();
					const coverage = String(item.coverage ?? "").trim();
					const issuingOrganization = String(
						item.issuingOrganization ?? "",
					).trim();
					const declarationDate = parseDeclarationDateFromSubmit(
						item.declarationDate,
					);
					const attachments = Array.isArray(item.attachments)
						? item.attachments
						: [];

					const declarationStatusIdRaw = String(
						item.declarationStatusId ?? "",
					).trim();
					const declarationStatusNameRaw = String(
						item.declarationStatus ?? "",
					).trim();
					const matchedStatus =
						declarationStatusById.get(declarationStatusIdRaw) ??
						declarationStatusByName.get(declarationStatusNameRaw);
					const declarationStatusId = matchedStatus?.id ?? null;

					if (
						!type &&
						!effects &&
						!coverage &&
						!issuingOrganization &&
						!declarationDate &&
						!declarationStatusId &&
						attachments.length === 0
					) {
						continue;
					}

					const createdDeclaration =
						await DisasterEventDeclarationRepository.createOne(
							{
								disasterEventId: eventId,
								type: type || null,
								effects: effects || null,
								declarationDate,
								issuingOrganization: issuingOrganization || null,
								coverage: coverage || null,
								declarationStatusId,
							},
							tx,
						);
					if (!createdDeclaration) {
						continue;
					}

					const existingAttachmentPayloads = attachments.filter(
						(attachment) =>
							typeof attachment.fileKey === "string" &&
							attachment.fileKey.trim().length > 0 &&
							(!attachment.tempFilePath ||
								attachment.tempFilePath.trim().length === 0),
					);
					for (const existingAttachment of existingAttachmentPayloads) {
						keptExistingFileKeys.add(String(existingAttachment.fileKey));
					}

					const newAttachmentPayloads = attachments.filter(
						(attachment) =>
							typeof attachment.tempFilePath === "string" &&
							attachment.tempFilePath.trim().length > 0,
					);

					let movedNewItems: Array<{
						file?: { name?: string; content_type?: string };
					}> = [];
					if (newAttachmentPayloads.length > 0) {
						const savePath = `/uploads/disaster-event/${eventId}/declarations/${createdDeclaration.id}`;
						movedNewItems = ContentRepeaterUploadFile.save(
							newAttachmentPayloads.map((upload) => ({
								file: {
									name: upload.tempFilePath,
									content_type: upload.fileType,
									tenantPath: upload.tenantPath,
								},
							})),
							TEMP_UPLOAD_PATH,
							savePath,
							undefined,
							countryAccountsId,
						);
					}

					const attachmentRows = [
						...existingAttachmentPayloads.map((attachment) => ({
							disasterEventDeclarationId: createdDeclaration.id,
							title: String(
								attachment.title ?? attachment.fileName ?? "",
							).trim(),
							fileKey: String(attachment.fileKey ?? ""),
							fileName: String(attachment.fileName ?? ""),
							fileType: String(attachment.fileType ?? ""),
							fileSize: Number(attachment.fileSize ?? 0),
						})),
						...movedNewItems.map((item, index) => {
							const source = newAttachmentPayloads[index];
							return {
								disasterEventDeclarationId: createdDeclaration.id,
								title: String(source?.title ?? source?.fileName ?? "").trim(),
								fileKey: String(item?.file?.name ?? ""),
								fileName: String(source?.fileName ?? ""),
								fileType:
									String(source?.fileType ?? "") ||
									String(item?.file?.content_type ?? ""),
								fileSize: Number(source?.fileSize ?? 0),
							};
						}),
					].filter(
						(row) =>
							row.fileKey.length > 0 &&
							row.fileName.length > 0 &&
							row.title.length > 0,
					);

					if (attachmentRows.length > 0) {
						await DisasterEventDeclarationAttachmentRepository.createMany(
							attachmentRows,
							tx,
						);
					}
				}

				const orphanedAttachments = existingAttachments.filter(
					(attachment) =>
						keptExistingFileKeys.has(String(attachment.fileKey)) === false,
				);
				if (orphanedAttachments.length > 0) {
					ContentRepeaterUploadFile.delete(
						orphanedAttachments.map((attachment) => ({
							file: {
								name: attachment.fileKey,
							},
						})),
						undefined,
						countryAccountsId,
					);
					ContentRepeaterUploadFile.deleteEmptyParentDirectoriesForFiles(
						orphanedAttachments.map((attachment) => ({
							file: {
								name: attachment.fileKey,
							},
						})),
						undefined,
						countryAccountsId,
					);
				}
			};

			if (id) {
				const returnValue = await disasterEventUpdate(ctx, tx, id, updatedData);

				if (returnValue.ok === true) {
					await syncDisasterEventDeclarations(id);
					await syncDisasterEventResponses(id);
					await syncDisasterEventAssessments(id);
					await syncDisasterEventAttachments(id);
					await syncDisasterEventLinks(id);
					await syncLinkedHazardousEvents(id);
					const syncDisasterEventResult = await syncLinkedDisasterEvents(id);
					if (!syncDisasterEventResult.ok) {
						return syncDisasterEventResult;
					}
					await syncLinkedDisasterRecords(id);
					await handleApprovalWorkflowService(ctx, tx, id, "disaster_event", {
						...updatedData,
						tempValidatorUserIds: formData.get("tempValidatorUserIds"),
						tempAction: formData.get("tempAction"),
					});
				}

				return returnValue;
			} else {
				const returnValue = await disasterEventCreate(ctx, tx, {
					...updatedData,
					createdByUserId: userSession.user.id,
				});

				if (returnValue.ok === true) {
					await syncDisasterEventDeclarations(returnValue.id);
					await syncDisasterEventResponses(returnValue.id);
					await syncDisasterEventAssessments(returnValue.id);
					await syncDisasterEventAttachments(returnValue.id);
					await syncDisasterEventLinks(returnValue.id);
					await syncLinkedHazardousEvents(returnValue.id);
					const syncDisasterEventResult = await syncLinkedDisasterEvents(
						returnValue.id,
					);
					if (!syncDisasterEventResult.ok) {
						return syncDisasterEventResult;
					}
					await syncLinkedDisasterRecords(returnValue.id);
					await handleApprovalWorkflowService(
						ctx,
						tx,
						returnValue.id,
						"disaster_event",
						{
							...updatedData,
							tempValidatorUserIds: formData.get("tempValidatorUserIds"),
							tempAction: formData.get("tempAction"),
						},
					);
				}

				return returnValue;
			}
		},
		redirectTo: (id: string) => route + "/" + id,
	});
});

export const loader = authLoaderWithPerm("EditData", async (loaderArgs) => {
	const { params, request } = loaderArgs;
	const ctx = new BackendContext(loaderArgs);
	const ctryIso3 = await getCountryIso3(request);
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	const userId = await getUserIdFromSession(request);
	const usersWithValidatorRole = await getUsersEligibleForValidation(
		countryAccountsId,
		userId,
	);

	// Handle 'new' case without DB query
	if (params.id === "new") {
		const [
			treeData,
			divisionGeoJSON,
			hip,
			user,
			currentUserOrganization,
			responseTypes,
			assessmentTypes,
			declarationStatuses,
			sectorOptions,
		] = await Promise.all([
			getDivisionTreeData(countryAccountsId),
			getDivisionGeoJSON(countryAccountsId),
			dataForHazardPicker(ctx),
			authLoaderGetUserForFrontend(loaderArgs),
			getCurrentUserOrganization(userId, countryAccountsId),
			ResponseTypeRepository.listAll(),
			AssessmentTypeRepository.listAll(),
			DeclarationStatusRepository.listAll(),
			getSectorOptions(ctx.lang),
		]);

		return {
			item: null, // No existing item for new disaster event
			hip,
			treeData,
			ctryIso3,
			divisionGeoJSON: divisionGeoJSON || [],
			disasterEventAttachments: [],
			disasterEventResponses: [],
			disasterEventResponseAttachments: [],
			disasterEventDeclarations: [],
			disasterEventDeclarationAttachments: [],
			disasterEventAssessments: [],
			disasterEventAssessmentAttachments: [],
			disasterEventAssessmentSectors: [],
			hazardousEventOptions: [],
			linkedTriggeringHazardousEvents: [],
			linkedTriggeredHazardousEvents: [],
			disasterEventLinks: [],
			disasterRecordOptions: [],
			linkedDisasterRecords: [],
			disasterEventOptions: [],
			linkedTriggeringDisasterEvents: [],
			linkedTriggeredDisasterEvents: [],
			responseTypes,
			assessmentTypes,
			declarationStatuses,
			sectorOptions,
			user,
			currentUserOrganization: currentUserOrganization?.organization ?? null,
			usersWithValidatorRole,
		};
	}

	// For existing items, fetch the disaster event
	const getDisasterEvent = async (ctx: BackendContext, id: string) => {
		return disasterEventById(ctx, id);
	};

	let item = null;
	try {
		item = await getItem2(ctx, params, getDisasterEvent);
		if (item.countryAccountsId !== countryAccountsId) {
			throw new Response("Unauthorized access", { status: 403 });
		}
	} catch (error) {
		// If item not found, return 404
		if (error instanceof Response && error.status === 404) {
			throw new Response("Disaster event not found", { status: 404 });
		}
		// Re-throw other errors
		throw error;
	}

	const userRole = (await getUserRoleFromSession(request)) as string;

	if (canEditDataCollectionRecord(userRole, item.approvalStatus) === false) {
		throw new Response("Access forbidden", { status: 403 });
	}

	const [
		treeData,
		divisionGeoJSON,
		hip,
		user,
		linkedData,
		linkedHazardousData,
		recordingOrganization,
		disasterEventAttachments,
		disasterEventResponses,
		disasterEventResponseAttachments,
		disasterEventAssessments,
		disasterEventAssessmentAttachments,
		disasterEventDeclarations,
		disasterEventDeclarationAttachments,
		disasterEventLinks,
		responseTypes,
		assessmentTypes,
		declarationStatuses,
		sectorOptions,
	] = await Promise.all([
		getDivisionTreeData(countryAccountsId),
		getDivisionGeoJSON(countryAccountsId),
		dataForHazardPicker(ctx),
		authLoaderGetUserForFrontend(loaderArgs),
		getLinkedDisasterData(countryAccountsId, item.id, ctx.lang),
		getLinkedHazardousData(
			countryAccountsId,
			ctx.lang,
			item.id,
			item.hazardousEvent?.id,
		),
		getRecordingOrganization(item.recordingOrganizationId),
		DisasterEventAttachmentRepository.getByDisasterEventId(item.id),
		DisasterEventResponseRepository.listByDisasterEventId(item.id),
		DisasterEventResponseAttachmentRepository.listByDisasterEventId(item.id),
		DisasterEventAssessmentRepository.listByDisasterEventId(item.id),
		DisasterEventAssessmentAttachmentRepository.listByDisasterEventId(item.id),
		DisasterEventDeclarationRepository.listByDisasterEventId(item.id),
		DisasterEventDeclarationAttachmentRepository.listByDisasterEventId(item.id),
		DisasterEventLinkRepository.getByDisasterEventId(item.id),
		ResponseTypeRepository.listAll(),
		AssessmentTypeRepository.listAll(),
		DeclarationStatusRepository.listAll(),
		getSectorOptions(ctx.lang),
	]);

	const disasterEventAssessmentSectors =
		await DisasterEventAssessmentSectorRepository.listByDisasterEventAssessmentIds(
			disasterEventAssessments.map((assessment) => assessment.id),
		);

	return {
		item,
		hip,
		treeData,
		ctryIso3,
		divisionGeoJSON: divisionGeoJSON || [],
		disasterEventAttachments,
		disasterEventResponses,
		disasterEventResponseAttachments,
		disasterEventAssessments,
		disasterEventAssessmentAttachments,
		disasterEventAssessmentSectors,
		disasterEventDeclarations,
		disasterEventDeclarationAttachments,
		hazardousEventOptions: linkedHazardousData.hazardousEventOptions,
		linkedTriggeringHazardousEvents:
			linkedHazardousData.linkedTriggeringHazardousEvents,
		linkedTriggeredHazardousEvents:
			linkedHazardousData.linkedTriggeredHazardousEvents,
		disasterEventLinks,
		disasterRecordOptions: linkedData.disasterRecordOptions,
		linkedDisasterRecords: linkedData.linkedDisasterRecords,
		responseTypes,
		assessmentTypes,
		declarationStatuses,
		sectorOptions,
		disasterEventOptions: linkedData.disasterEventOptions,
		linkedTriggeringDisasterEvents: linkedData.linkedTriggeringDisasterEvents,
		linkedTriggeredDisasterEvents: linkedData.linkedTriggeredDisasterEvents,
		user,
		recordingOrganization,
		currentUserOrganization: null,
		usersWithValidatorRole,
	};
});

export default function FormScreen() {
	const ld = useLoaderData<typeof loader>();
	const actionData = useActionData() as
		| {
				ok?: boolean;
				errors?: {
					form?: string[];
				};
		  }
		| undefined;
	const serverFormErrors =
		actionData?.ok === false && Array.isArray(actionData.errors?.form)
			? actionData.errors.form
			: [];
	const ctx = new ViewContext();
	const disasterEventForForm = ld.item
		? {
				...ld.item.disasterEvent,
				recordingOrganizationId: ld.item.recordingOrganizationId,
				recordingOrganizationName: ld.recordingOrganization?.name ?? null,
			}
		: null;

	const fixedHazardousEvent = ld.item?.hazardousEvent
		? {
				...ld.item.hazardousEvent,
			}
		: null;

	return (
		<DisasterEventForm
			ctx={ctx}
			hazardousEvent={fixedHazardousEvent}
			hip={ld.hip}
			disasterEvent={disasterEventForForm}
			disasterEventAttachments={ld.disasterEventAttachments ?? []}
			disasterEventResponses={ld.disasterEventResponses ?? []}
			disasterEventResponseAttachments={
				ld.disasterEventResponseAttachments ?? []
			}
			disasterEventAssessments={ld.disasterEventAssessments ?? []}
			disasterEventAssessmentAttachments={
				ld.disasterEventAssessmentAttachments ?? []
			}
			disasterEventAssessmentSectors={ld.disasterEventAssessmentSectors ?? []}
			disasterEventDeclarations={ld.disasterEventDeclarations ?? []}
			disasterEventDeclarationAttachments={
				ld.disasterEventDeclarationAttachments ?? []
			}
			disasterEventLinks={ld.disasterEventLinks ?? []}
			hazardousEventOptions={ld.hazardousEventOptions ?? []}
			linkedTriggeringHazardousEvents={ld.linkedTriggeringHazardousEvents ?? []}
			linkedTriggeredHazardousEvents={ld.linkedTriggeredHazardousEvents ?? []}
			disasterEventOptions={ld.disasterEventOptions ?? []}
			linkedTriggeringDisasterEvents={ld.linkedTriggeringDisasterEvents ?? []}
			linkedTriggeredDisasterEvents={ld.linkedTriggeredDisasterEvents ?? []}
			disasterRecordOptions={ld.disasterRecordOptions ?? []}
			linkedDisasterRecords={ld.linkedDisasterRecords ?? []}
			responseTypes={ld.responseTypes ?? []}
			assessmentTypes={ld.assessmentTypes ?? []}
			declarationStatuses={ld.declarationStatuses ?? []}
			sectorOptions={ld.sectorOptions ?? []}
			currentUserOrganization={ld.currentUserOrganization ?? null}
			user={ld.user}
			usersWithValidatorRole={ld.usersWithValidatorRole ?? []}
			serverFormErrors={serverFormErrors}
		/>
	);
}
