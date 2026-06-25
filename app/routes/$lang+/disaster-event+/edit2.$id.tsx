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

import { useLoaderData } from "react-router";

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
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { dr } from "~/db.server";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { disasterRecordsTable } from "~/drizzle/schema/disasterRecordsTable";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
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
import { DisasterEventAttachmentRepository } from "~/db/queries/disasterEventAttachmentRepository";
import { handleApprovalWorkflowService } from "~/backend.server/services/approvalWorkflowService";
import { canEditDataCollectionRecord } from "~/frontend/user/roles";
import { ContentRepeaterUploadFile } from "~/components/ContentRepeater/UploadFile";
import { TEMP_UPLOAD_PATH } from "~/utils/paths";

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

async function getRecordingOrganization(recordingOrganizationId?: string | null) {
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

function formatDisasterEventDisplayName(event: {
	id: string;
	nameNational: string | null;
	nameGlobalOrRegional: string | null;
}) {
	const displayName =
		event.nameNational?.trim() ||
		event.nameGlobalOrRegional?.trim() ||
		`Disaster event ${event.id.slice(0, 8)}`;

	return {
		id: event.id,
		name: displayName,
		code: `${event.id}`,
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
		apiImportId: string | null;
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
		`Hazardous event ${event.id.slice(0, 8)}`;

	return {
		id: event.id,
		name: displayName,
		code: event.apiImportId?.trim() || event.id,
	};
}

async function getLinkedHazardousData(
	countryAccountsId: string,
	lang: string,
	selectedHazardousEventId?: string | null,
) {
	const hazardousEvents = await dr.query.hazardousEventTable.findMany({
		columns: {
			id: true,
			description: true,
			apiImportId: true,
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

	const hazardousEventOptions = hazardousEvents.map((event) =>
		formatHazardousEventDisplayName(event, lang),
	);

	const linkedHazardousEvents = selectedHazardousEventId
		? hazardousEventOptions.filter(
			(event) => event.id === selectedHazardousEventId,
		)
		: [];

	return {
		hazardousEventOptions,
		linkedHazardousEvents,
	};
}

async function getLinkedDisasterData(
	countryAccountsId: string,
	itemId: string,
) {
	const disasterEvents = await dr
		.select({
			id: disasterEventTable.id,
			disasterEventId: disasterEventTable.disasterEventId,
			nameNational: disasterEventTable.nameNational,
			nameGlobalOrRegional: disasterEventTable.nameGlobalOrRegional,
		})
		.from(disasterEventTable)
		.where(eq(disasterEventTable.countryAccountsId, countryAccountsId))
		.orderBy(desc(disasterEventTable.updatedAt));

	const disasterEventOptions = disasterEvents
		.filter((event) => event.id !== itemId)
		.map(formatDisasterEventDisplayName);

	const linkedDisasterEvents = disasterEvents
		.filter((event) => event.disasterEventId === itemId)
		.map(formatDisasterEventDisplayName);

	const disasterRecords = await dr
		.select({
			id: disasterRecordsTable.id,
			disasterEventId: disasterRecordsTable.disasterEventId,
		})
		.from(disasterRecordsTable)
		.where(eq(disasterRecordsTable.countryAccountsId, countryAccountsId))
		.orderBy(desc(disasterRecordsTable.updatedAt));

	const disasterRecordOptions = disasterRecords.map((record) => ({
		id: record.id,
		name: `Record ${record.id.slice(0, 8)}`,
		code: record.id,
	}));

	const linkedDisasterRecords = disasterRecords
		.filter((record) => record.disasterEventId === itemId)
		.map((record) => ({
			id: record.id,
			name: `Record ${record.id.slice(0, 8)}`,
			code: record.id,
		}));

	return {
		disasterEventOptions,
		linkedDisasterEvents,
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
	const linkedDisasterEventIdsRaw = String(
		formData.get("linkedDisasterEventIds") ?? "[]",
	);
	const hasExistingAttachmentIdsField = formData.has("existingAttachmentIds");
	const existingAttachmentIdsRaw = String(
		formData.get("existingAttachmentIds") ?? "[]",
	);
	const hasNewAttachmentUploadsField = formData.has("newAttachmentUploads");
	const newAttachmentUploadsRaw = String(
		formData.get("newAttachmentUploads") ?? "[]",
	);
	let linkedDisasterRecordIds: string[] = [];
	let linkedDisasterEventIds: string[] = [];
	let existingAttachmentIds: string[] = [];
	let newAttachmentUploads: Array<{
		fileName: string;
		fileType: string;
		fileSize: number;
		tempFilePath: string;
		tenantPath?: string;
	}> = [];
	try {
		const parsed = JSON.parse(linkedDisasterRecordIdsRaw);
		linkedDisasterRecordIds = Array.isArray(parsed)
			? parsed.filter((value): value is string => typeof value === "string")
			: [];
	} catch {
		linkedDisasterRecordIds = [];
	}
	try {
		const parsed = JSON.parse(linkedDisasterEventIdsRaw);
		linkedDisasterEventIds = Array.isArray(parsed)
			? parsed.filter((value): value is string => typeof value === "string")
			: [];
	} catch {
		linkedDisasterEventIds = [];
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
				(value): value is {
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

	return formSave({
		actionArgs,
		fieldsDef: fieldsDef(ctx),
		save: async (tx, id, data) => {
			const updatedData = {
				...data,
				countryAccountsId,
				updatedByUserId: userSession.user.id,
			};
			const syncLinkedDisasterEvents = async (eventId: string) => {
				const selectedIds = new Set(linkedDisasterEventIds);
				const currentLinkedEvents = await tx
					.select({ id: disasterEventTable.id })
					.from(disasterEventTable)
					.where(
						and(
							eq(disasterEventTable.countryAccountsId, countryAccountsId),
							eq(disasterEventTable.disasterEventId, eventId),
						),
					);

				const currentLinkedIds = new Set(
					currentLinkedEvents.map((event) => event.id),
				);

				for (const linkedEventId of linkedDisasterEventIds) {
					const updateResult = await tx
						.update(disasterEventTable)
						.set({
							disasterEventId: eventId,
							updatedAt: new Date(),
						})
						.where(
							and(
								eq(disasterEventTable.id, linkedEventId),
								eq(disasterEventTable.countryAccountsId, countryAccountsId),
							),
						)
						.returning({ id: disasterEventTable.id });
					if (updateResult.length === 0) {
						throw new Error(
							`Failed to link disaster event ${linkedEventId} to disaster event ${eventId}`,
						);
					}
				}

				for (const linkedEventId of currentLinkedIds) {
					if (!selectedIds.has(linkedEventId)) {
						const updateResult = await tx
							.update(disasterEventTable)
							.set({
								disasterEventId: null,
								updatedAt: new Date(),
							})
							.where(
								and(
									eq(disasterEventTable.id, linkedEventId),
									eq(disasterEventTable.countryAccountsId, countryAccountsId),
								),
							)
							.returning({ id: disasterEventTable.id });
						if (updateResult.length === 0) {
							throw new Error(
								`Failed to unlink disaster event ${linkedEventId} from disaster event ${eventId}`,
							);
						}
					}
				}
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

			const syncDisasterEventAttachments = async (eventId: string) => {
				if (hasExistingAttachmentIdsField) {
					const existingAttachmentsBeforeDelete =
						await DisasterEventAttachmentRepository.getByDisasterEventId(eventId, tx);
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

				if (!hasNewAttachmentUploadsField || newAttachmentUploads.length === 0) {
					return;
				}

				const existingAttachmentsAfterSync =
					await DisasterEventAttachmentRepository.getByDisasterEventId(eventId, tx);

				const savePath = `/uploads/disaster-event/${eventId}`;
				const existingItems = existingAttachmentsAfterSync.map((attachment) => ({
					file: {
						name: attachment.fileKey,
						content_type: attachment.fileType,
					},
				}));
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
					.map((item: { file?: { name?: string; content_type?: string } }, index: number) => ({
						disasterEventId: eventId,
						fileKey: String(item?.file?.name ?? ""),
						fileName: newAttachmentUploads[index]?.fileName ?? "",
						fileType:
							newAttachmentUploads[index]?.fileType ||
							String(item?.file?.content_type ?? ""),
						fileSize: Number(newAttachmentUploads[index]?.fileSize ?? 0),
					}))
					.filter(
						(row: { fileKey: string; fileName: string }) =>
							row.fileKey.length > 0 && row.fileName.length > 0,
					);

				if (newAttachmentRows.length > 0) {
					await DisasterEventAttachmentRepository.createMany(newAttachmentRows, tx);
				}
			};

			if (id) {
				const returnValue = await disasterEventUpdate(ctx, tx, id, updatedData);

				if (returnValue.ok === true) {
					await syncDisasterEventAttachments(id);
					await syncLinkedDisasterEvents(id);
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
					await syncDisasterEventAttachments(returnValue.id);
					await syncLinkedDisasterEvents(returnValue.id);
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
		const [treeData, divisionGeoJSON, hip, user, currentUserOrganization] =
			await Promise.all([
				getDivisionTreeData(countryAccountsId),
				getDivisionGeoJSON(countryAccountsId),
				dataForHazardPicker(ctx),
				authLoaderGetUserForFrontend(loaderArgs),
				getCurrentUserOrganization(userId, countryAccountsId),
			]);

		return {
			item: null, // No existing item for new disaster event
			hip,
			treeData,
			ctryIso3,
			divisionGeoJSON: divisionGeoJSON || [],
			disasterEventAttachments: [],
			hazardousEventOptions: [],
			linkedHazardousEvents: [],
			disasterRecordOptions: [],
			linkedDisasterRecords: [],
			disasterEventOptions: [],
			linkedDisasterEvents: [],
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
	] = await Promise.all([
		getDivisionTreeData(countryAccountsId),
		getDivisionGeoJSON(countryAccountsId),
		dataForHazardPicker(ctx),
		authLoaderGetUserForFrontend(loaderArgs),
		getLinkedDisasterData(countryAccountsId, item.id),
		getLinkedHazardousData(
			countryAccountsId,
			ctx.lang,
			item.hazardousEvent?.id,
		),
		getRecordingOrganization(item.recordingOrganizationId),
		DisasterEventAttachmentRepository.getByDisasterEventId(item.id),
	]);

	return {
		item,
		hip,
		treeData,
		ctryIso3,
		divisionGeoJSON: divisionGeoJSON || [],
		disasterEventAttachments,
		hazardousEventOptions: linkedHazardousData.hazardousEventOptions,
		linkedHazardousEvents: linkedHazardousData.linkedHazardousEvents,
		disasterRecordOptions: linkedData.disasterRecordOptions,
		linkedDisasterRecords: linkedData.linkedDisasterRecords,
		disasterEventOptions: linkedData.disasterEventOptions,
		linkedDisasterEvents: linkedData.linkedDisasterEvents,
		user,
		recordingOrganization,
		currentUserOrganization: null,
		usersWithValidatorRole,
	};
});


export default function FormScreen() {
	const ld = useLoaderData<typeof loader>();
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
			hazardousEventOptions={ld.hazardousEventOptions ?? []}
			linkedHazardousEvents={ld.linkedHazardousEvents ?? []}
			disasterRecordOptions={ld.disasterRecordOptions ?? []}
			linkedDisasterRecords={ld.linkedDisasterRecords ?? []}
			disasterEventOptions={ld.disasterEventOptions ?? []}
			linkedDisasterEvents={ld.linkedDisasterEvents ?? []}
			currentUserOrganization={ld.currentUserOrganization ?? null}
			user={ld.user}
			usersWithValidatorRole={ld.usersWithValidatorRole ?? []}
		/>
	);
}
