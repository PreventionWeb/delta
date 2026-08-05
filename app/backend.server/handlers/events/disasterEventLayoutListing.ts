import { CountryAccountsRepository } from "~/db/queries/countryAccountsRepository";
import { CountryRepository } from "~/db/queries/countriesRepository";
import { DisasterEventRepository } from "~/db/queries/disasterEventRepository";
import { HipClassRepository } from "~/db/queries/hipClassRepository";
import { HipClusterRepository } from "~/db/queries/hipClusterRepository";
import { HipHazardRepository } from "~/db/queries/hipHazardRepository";
import { paginationQueryFromURL } from "~/frontend/pagination/api.server";
import { hasPermission } from "~/utils/auth";
import {
	getCountryAccountsIdFromSession,
	getUserIdFromSession,
	getUserRoleFromSession,
} from "~/utils/session";

type LocalizedLabel = Record<string, string>;

type DisasterEventListingFilters = {
	disasterEventName: string;
	recordingOrganization: string;
	recordStatus: string;
	hazardType: string;
	hazardCluster: string;
	specificHazard: string;
	viewMyRecords: boolean;
	pendingMyAction: boolean;
};

type PaginatedDisasterEvents = Awaited<
	ReturnType<typeof DisasterEventRepository.getByCountryAccountsIdPaginated>
>;

type DisasterEventLayoutLoaderData = {
	showListing: boolean;
	items: PaginatedDisasterEvents["items"];
	hipTypes: Array<{ id: string; name: string }>;
	hipClusters: Array<{ id: string; typeId: string; name: string }>;
	hipHazards: Array<{
		id: string;
		clusterId: string;
		code: string;
		name: string;
	}>;
	pagination: PaginatedDisasterEvents["pagination"];
	canDeleteDisasterEvent: boolean;
	canEditDisasterEvent: boolean;
	loggedInUserRoleName: string;
	countryName: string;
	filters: DisasterEventListingFilters;
};

const viewerOnlyStatuses = ["published", "validated"];

function getLocalizedName(name: LocalizedLabel, lang: string, fallbackId: string) {
	return String(name[lang] || name.en || Object.values(name)[0] || fallbackId);
}

function emptyDisasterEventLayoutData(
	showListing: boolean,
): DisasterEventLayoutLoaderData {
	return {
		showListing,
		items: [],
		hipTypes: [],
		hipClusters: [],
		hipHazards: [],
		pagination: {
			totalItems: 0,
			itemsOnThisPage: 0,
			page: 1,
			pageSize: 25,
		},
		canDeleteDisasterEvent: false,
		canEditDisasterEvent: false,
		loggedInUserRoleName: "",
		countryName: "",
		filters: {
			disasterEventName: "",
			recordingOrganization: "",
			recordStatus: "",
			hazardType: "",
			hazardCluster: "",
			specificHazard: "",
			viewMyRecords: false,
			pendingMyAction: false,
		},
	};
}

function parseDisasterEventListingFilters(url: URL): DisasterEventListingFilters {
	return {
		disasterEventName:
			url.searchParams.get("disasterEventName")?.trim() || "",
		recordingOrganization:
			url.searchParams.get("recordingOrganization")?.trim() || "",
		recordStatus: url.searchParams.get("recordStatus")?.trim() || "",
		hazardType: url.searchParams.get("hazardType")?.trim() || "",
		hazardCluster: url.searchParams.get("hazardCluster")?.trim() || "",
		specificHazard: url.searchParams.get("specificHazard")?.trim() || "",
		viewMyRecords: url.searchParams.get("viewMyRecords") === "true",
		pendingMyAction: url.searchParams.get("pendingMyAction") === "true",
	};
}

export function shouldShowDisasterEventListingBackground(pathname: string): boolean {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length < 2) {
		return false;
	}

	// /:lang/disaster-event
	if (segments.length === 2 && segments[1] === "disaster-event") {
		return true;
	}

	// /:lang/disaster-event/delete/:id
	if (
		segments[1] === "disaster-event" &&
		segments[2] === "delete" &&
		segments.length >= 4
	) {
		return true;
	}

	return false;
}

export async function loadDisasterEventLayoutData(args: {
	request: Request;
	url: URL;
}): Promise<DisasterEventLayoutLoaderData> {
	const { request, url } = args;
	const showListing = shouldShowDisasterEventListingBackground(url.pathname);
	if (!showListing) {
		return emptyDisasterEventLayoutData(showListing);
	}

	const filters = parseDisasterEventListingFilters(url);
	const countryAccountsId = await getCountryAccountsIdFromSession(request);
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const countryAccounts = await CountryAccountsRepository.getById(countryAccountsId);
	if (!countryAccounts) {
		throw new Response("Country accounts not found", { status: 404 });
	}

	const country = await CountryRepository.getById(countryAccounts.countryId);
	if (!country) {
		throw new Response("Country not found", { status: 404 });
	}

	const { viewData } = paginationQueryFromURL(request, []);
	const effectivePageSize = url.searchParams.has("pageSize")
		? viewData.pageSize
		: 20;
	const userId = await getUserIdFromSession(request);
	const loggedInUserRoleName = (await getUserRoleFromSession(request)) || "";
	const canDeleteDisasterEvent = await hasPermission(
		request,
		"DeleteDisasterEvent",
	);
	const canEditDisasterEvent = await hasPermission(
		request,
		"EditDisasterEvent",
	);

	const effectiveRecordStatus = canEditDisasterEvent
		? filters.recordStatus
		: viewerOnlyStatuses.includes(filters.recordStatus)
			? filters.recordStatus
			: "";

	const result = await DisasterEventRepository.getByCountryAccountsIdPaginated(
		countryAccountsId,
		viewData.page,
		effectivePageSize,
		{
			disasterEventName: filters.disasterEventName,
			recordingOrganization: filters.recordingOrganization,
			recordStatus: effectiveRecordStatus,
			recordStatuses:
				!canEditDisasterEvent && !effectiveRecordStatus
					? viewerOnlyStatuses
					: undefined,
			hazardType: filters.hazardType,
			hazardCluster: filters.hazardCluster,
			specificHazard: filters.specificHazard,
			createdByUserId: filters.viewMyRecords ? userId : undefined,
			pendingMyAction:
				filters.pendingMyAction && userId ? { userId } : undefined,
		},
	);

	const lang = url.pathname.split("/").filter(Boolean)[0] || "en";
	const hipTypesRaw = await HipClassRepository.getAll();
	const hipTypes = hipTypesRaw.map((hipType) => ({
		id: hipType.id,
		name: getLocalizedName(hipType.name, lang, hipType.id),
	}));

	const hipClustersRaw = await HipClusterRepository.getAll();
	const hipClusters = hipClustersRaw.map((hipCluster) => ({
		id: hipCluster.id,
		typeId: hipCluster.typeId,
		name: getLocalizedName(hipCluster.name, lang, hipCluster.id),
	}));

	const hipHazardsRaw = await HipHazardRepository.getAll();
	const hipHazards = hipHazardsRaw.map((hipHazard) => ({
		id: hipHazard.id,
		clusterId: hipHazard.clusterId,
		code: hipHazard.code,
		name: getLocalizedName(hipHazard.name, lang, hipHazard.id),
	}));

	return {
		showListing,
		hipClusters,
		hipHazards,
		...result,
		hipTypes,
		canDeleteDisasterEvent,
		canEditDisasterEvent,
		loggedInUserRoleName,
		countryName: country.name,
		filters: {
			...filters,
			recordStatus: effectiveRecordStatus,
		},
	};
}