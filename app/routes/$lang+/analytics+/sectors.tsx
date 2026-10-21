import { useState, useEffect, useCallback, useMemo } from "react";
import type { MetaFunction } from "react-router";
import { useLoaderData, useLocation, useSubmit } from "react-router";

import { authLoaderPublicOrWithPerm } from "~/utils/auth";
import { NavSettings } from "~/frontend/components/NavSettings";
import { MainContainer } from "~/frontend/container";

import ErrorBoundary from "~/frontend/components/ErrorBoundary";

import Filters from "~/frontend/analytics/sectors/sections/Filters";
import ImpactOnSector from "~/frontend/analytics/sectors/sections/ImpactOnSector";
import ImpactByHazard from "~/frontend/analytics/sectors/sections/ImpactByHazard";
import ImpactMap from "~/frontend/analytics/sectors/sections/ImpactMap";
import EffectDetails from "~/frontend/analytics/sectors/sections/EffectDetails";
import MostDamagingEvents from "~/frontend/analytics/sectors/sections/MostDamagingEvents";

import {
	getCountryAccountsIdFromSession,
	getCountrySettingsFromSession,
} from "~/utils/session";
import { getImpactOnSector, getSectorImpactTotal } from "~/backend.server/handlers/analytics/ImpactonSectors";
import { getHazardImpact } from "~/backend.server/handlers/analytics/hazardImpact";
import { getEffectDetailsHandler } from "~/backend.server/handlers/analytics/effectDetails";
import { handleMostDamagingEventsRequest } from "~/backend.server/handlers/analytics/mostDamagingEvents";
import { getSectorsWithSubsectors } from "~/backend.server/handlers/analytics/sectorsHandlers";
import { getGeographicLevelsHandler } from "~/backend.server/handlers/analytics/geographicLevelsHandler";
import { getDisasterEvents } from "~/backend.server/handlers/analytics/disaster-events";
import { getHazardTypes } from "~/backend.server/handlers/analytics/hazard-types";
import { getHazardClustersHandler } from "~/backend.server/handlers/analytics/hazard-clusters";
import { getSpecificHazardsHandler } from "~/backend.server/handlers/analytics/specific-hazards";
import { getRelatedHazardDataHandler } from "~/backend.server/handlers/analytics/related-hazard-data";

import type { HazardImpactFilters } from "~/types/hazardImpact";
import { redirectLangFromRoute } from "~/utils/url.backend";

import { ViewContext } from "~/frontend/context";

import { BackendContext } from "~/backend.server/context";
import { htmlTitle } from "~/utils/htmlmeta";
import { getDivisionByLevel } from "~/backend.server/models/division";

// Define the type for filters to match what the component expects
interface Filters {
	disasterEventId: string | null;
	sectorId: string | null;
	hazardTypeId: string | null;
	hazardClusterId: string | null;
	specificHazardId: string | null;
	geographicLevelId: string | null;
	fromDate: string | null;
	toDate: string | null;
	subSectorId: string | null;
	assessmentType?: "rapid" | "detailed";
	confidenceLevel?: "low" | "medium" | "high";
}

// Define the type for the API response expected by the ImpactOnSector component
interface ApiResponse {
	success: boolean;
	data: {
		eventCount: number;
		totalDamage: string;
		totalLoss: string;
		eventsOverTime: Record<string, string>;
		damageOverTime: Record<string, string>;
		lossOverTime: Record<string, string>;
		dataAvailability: {
			damage: string;
			loss: string;
		};
	};
}

// Define the type for the hazard impact API response
interface HazardImpactApiResponse {
	success: boolean;
	data: {
		eventsCount: Array<{
			hazardId: string; // Changed from number to string to match actual data
			hazardName: string;
			value: string;
			percentage: number;
		}>;
		damages: Array<{
			hazardId: string; // Changed from number to string to match actual data
			hazardName: string;
			value: string;
			percentage: number;
		}>;
		losses: Array<{
			hazardId: string; // Changed from number to string to match actual data
			hazardName: string;
			value: string;
			percentage: number;
		}>;
	};
}

// Define an interface for the structure of the JSON objects
interface interfaceMap {
	total: number;
	name: string;
	description: string;
	colorPercentage: number;
	geojson: any;
}

/**
 * Loader with authentication restriction for sectors analytics page
 */
export const loader = authLoaderPublicOrWithPerm(
	"ViewData",
	async (loaderArgs) => {
		const ctx = new BackendContext(loaderArgs);
		const { request } = loaderArgs;
		const countryAccountsId = await getCountryAccountsIdFromSession(request);

		let damagesGeoData: interfaceMap[] = [];
		let lossesGeoData: interfaceMap[] = [];

		// TEMPORARY RESTRICTION: Redirect unauthenticated users to unauthorized page
		// This is a temporary measure until business rules for public access are defined
		if (!countryAccountsId) {
			return redirectLangFromRoute(
				loaderArgs,
				"/error/unauthorized?reason=content-not-published",
			);
		}

		try {
			// Parse URL to extract query parameters
			const url = new URL(request.url);
			const sectorId = url.searchParams.get("sectorId");
			const subSectorId = url.searchParams.get("subSectorId");
			const hazardTypeId = url.searchParams.get("hazardTypeId");
			const hazardClusterId = url.searchParams.get("hazardClusterId");
			const specificHazardId = url.searchParams.get("specificHazardId");
			const geographicLevelId = url.searchParams.get("geographicLevelId");
			const fromDate = url.searchParams.get("fromDate");
			const toDate = url.searchParams.get("toDate");
			const disasterEventId = url.searchParams.get("disasterEventId");

			// Get currency from instanceSystemSettings via session
			const settings = await getCountrySettingsFromSession(loaderArgs.request);
			let currency = "USD";
			if (settings && settings.currencyCode) {
				currency = settings.currencyCode;
			}

			// Prepare filters object
			const filters: Filters = {
				disasterEventId,
				sectorId,
				hazardTypeId,
				hazardClusterId,
				specificHazardId,
				geographicLevelId,
				fromDate,
				toDate,
				subSectorId,
			};

			// Only fetch sector impact data if we have a sector ID
			let sectorImpactData: ApiResponse | null = null;
			let hazardImpactData: HazardImpactApiResponse | null = null;
			let geographicImpactData: any = null;
			let effectDetailsData: any = null;
			let mostDamagingEventsData: any = null;

			// Variables for hazard-related data
			let hazardTypesData: any = null;
			let hazardClustersData: any = null;
			let specificHazardsData: any = null;
			let sectorsData = null;
			let geographicLevelsData = null;
			let disasterEventsData = null;

			// Fetch sectors data for dynamic titles
			try {
				sectorsData = await getSectorsWithSubsectors(ctx);
			} catch (error) {
				console.error("LOADER ERROR - Failed to fetch sectors data:", error);
				sectorsData = null;
			}

			// Fetch hazard types data
			try {
				const hazardTypes = await getHazardTypes(ctx);
				hazardTypesData = { hazardTypes };
			} catch (error) {
				console.error(
					"LOADER ERROR - Failed to fetch hazard types data:",
					error,
				);
				hazardTypesData = null;
			}

			// Fetch hazard clusters data
			try {
				if (hazardTypeId) {
					// Fetch clusters using the handler with the specific hazardTypeId
					const clusters = await getHazardClustersHandler(ctx, hazardTypeId);

					// Ensure clusters is always an array
					const clusterArray = Array.isArray(clusters) ? clusters : [];

					// Assign the clusters to the hazardClustersData object
					hazardClustersData = { clusters: clusterArray };
				} else {
					// If no hazardTypeId is provided, fetch all clusters
					const allClusters = await getHazardClustersHandler(ctx);
					hazardClustersData = { clusters: allClusters };
				}
			} catch (error) {
				console.error(
					"LOADER ERROR - Failed to fetch hazard clusters data:",
					error,
				);
				hazardClustersData = { clusters: [] };
			}

			// Fetch ALL specific hazards data regardless of hazardClusterId
			try {
				// Fetch all specific hazards without filtering by cluster
				const allHazards = await getSpecificHazardsHandler(ctx);
				specificHazardsData = { hazards: allHazards };
			} catch (error) {
				console.error(
					"LOADER ERROR - Failed to fetch specific hazards data:",
					error,
				);
				specificHazardsData = { hazards: [] };
			}

			// Fetch geographic levels data for filters
			try {
				const geographicLevelsResponse =
					await getGeographicLevelsHandler(countryAccountsId);
				if (
					geographicLevelsResponse.success &&
					geographicLevelsResponse.levels
				) {
					geographicLevelsData = geographicLevelsResponse;
				} else {
					console.error(
						"LOADER ERROR - Failed to fetch geographic levels data:",
						geographicLevelsResponse.error,
					);
					geographicLevelsData = null;
				}
			} catch (error) {
				console.error(
					"LOADER ERROR - Failed to fetch geographic levels data:",
					error,
				);
				geographicLevelsData = null;
			}

			// Fetch disaster events data for filters
			try {
				if (countryAccountsId) {
					// Get raw data from handler
					const rawDisasterEvents = await getDisasterEvents(countryAccountsId);

					// Format it to match the original API response structure
					disasterEventsData = { disasterEvents: rawDisasterEvents };
				} else {
					console.error(
						"LOADER ERROR - Missing tenant context for disaster events",
					);
					disasterEventsData = null;
				}
			} catch (error) {
				console.error(
					"LOADER ERROR - Failed to fetch disaster events data:",
					error,
				);
				disasterEventsData = null;
			}

			if (sectorId || subSectorId) {
				// Convert filters to the format expected by the handlers
				const handlerFilters = {
					startDate: filters.fromDate,
					endDate: filters.toDate,
					hazardType: filters.hazardTypeId,
					hazardCluster: filters.hazardClusterId,
					specificHazard: filters.specificHazardId,
					geographicLevel: filters.geographicLevelId,
					disasterEvent: filters.disasterEventId,
				};

				// Call the handler directly with tenant context
				if (!countryAccountsId) {
					console.error("LOADER ERROR - No valid tenant context available");
					return {
						settings,
						currency,
						sectorImpactData: null,
						hazardImpactData: null,
						geographicImpactData: null,
					};
				}

				// Fetch sector impact data
				const sectorHandlerResponse = await getImpactOnSector(
					ctx,
					countryAccountsId,
					subSectorId || sectorId || "",
					handlerFilters,
					currency,
				);

				// Transform handler response to match the ApiResponse type expected by ImpactOnSector
				if (sectorHandlerResponse.success && sectorHandlerResponse.data) {
					sectorImpactData = {
						success: sectorHandlerResponse.success,
						data: {
							eventCount: sectorHandlerResponse.data.eventCount,
							totalDamage: sectorHandlerResponse.data.totalDamage || "0",
							totalLoss: sectorHandlerResponse.data.totalLoss || "0",
							eventsOverTime: sectorHandlerResponse.data.eventsOverTime || {},
							damageOverTime: sectorHandlerResponse.data.damageOverTime || {},
							lossOverTime: sectorHandlerResponse.data.lossOverTime || {},
							dataAvailability: sectorHandlerResponse.data.dataAvailability || {
								damage: "no_data",
								loss: "no_data",
							},
						},
					};
				}

				// Fetch hazard impact data
				try {
					// Convert filters to the format expected by the hazard impact handler
					const hazardFilters: HazardImpactFilters = {
						sectorId: subSectorId || sectorId || "",
						hazardTypeId: filters.hazardTypeId || undefined,
						hazardClusterId: filters.hazardClusterId || undefined,
						specificHazardId: filters.specificHazardId || undefined,
						geographicLevelId: filters.geographicLevelId || undefined,
						fromDate: filters.fromDate || undefined,
						toDate: filters.toDate || undefined,
						disasterEventId: filters.disasterEventId || undefined,
					};

					const hazardHandlerResponse = await getHazardImpact(
						ctx,
						countryAccountsId,
						hazardFilters,
					);

					if (hazardHandlerResponse.success && hazardHandlerResponse.data) {
						hazardImpactData = {
							success: hazardHandlerResponse.success,
							data: {
								eventsCount: hazardHandlerResponse.data.eventsCount || [],
								damages: hazardHandlerResponse.data.damages || [],
								losses: hazardHandlerResponse.data.losses || [],
							},
						};
					}
				} catch (error) {
					hazardImpactData = null;
				}
				// Fetch geographic impact data
				var tmpSector = subSectorId || sectorId || null;
				if (tmpSector && tmpSector.length > 0) {
					// Populate data for damages and losses geo data
					const divisionLevel1 = await getDivisionByLevel(
						1,
						countryAccountsId,
					);

					for (const item of divisionLevel1) {
						const lossesMapTotal = await getSectorImpactTotal({
							impact: "losses",
							countryAccountsId: countryAccountsId,
							type: {
								sectorId: tmpSector || "",
							},
							divisionId: item.id,
						});
						const damagesMapTotal = await getSectorImpactTotal({
							impact: "damages",
							countryAccountsId: countryAccountsId,
							type: {
								sectorId: tmpSector || "" 
							},
							divisionId: item.id,
						});
						
						// Populate the geoData for the map for losses
						lossesGeoData.push({
							total: lossesMapTotal?.lossesTotal || 0,
							name: String(item.name["en"]),
							description:
								ctx.t({
									code: "analysis.total_losses",
									msg: "Total losses",
								}) +
								": " +
								currency +
								" " +
								lossesMapTotal?.lossesTotal?.toLocaleString(
									navigator.language,
									{ minimumFractionDigits: 0 },
								),
							colorPercentage: 1,
							geojson: item.geojson,
						});

						// Populate the geoData for the map for damages
						damagesGeoData.push({
							total: damagesMapTotal?.damagesTotal || 0,
							name: String(item.name["en"]),
							description:
								ctx.t({
									code: "analysis.total_damage",
									msg: "Total damage",
								}) +
								": " +
								currency +
								" " +
								damagesMapTotal?.damagesTotal?.toLocaleString(
									navigator.language,
									{ minimumFractionDigits: 0 },
								),
							colorPercentage: 1,
							geojson: item.geojson,
						});
					}
				}
			}

			// Fetch effect details data
			try {
				// Convert filters to the format expected by the effect details handler
				const effectDetailsFilters = {
					sectorId: subSectorId || sectorId || null,
					subSectorId: subSectorId || null,
					hazardTypeId: filters.hazardTypeId || null,
					hazardClusterId: filters.hazardClusterId || null,
					specificHazardId: filters.specificHazardId || null,
					geographicLevelId: filters.geographicLevelId || null,
					fromDate: filters.fromDate || null,
					toDate: filters.toDate || null,
					disasterEventId: filters.disasterEventId || null,
				};

				// Ensure tenantContext is defined before calling the handler
				if (countryAccountsId) {
					const effectDetailsResponse = await getEffectDetailsHandler(
						ctx,
						countryAccountsId,
						effectDetailsFilters,
					);

					if (effectDetailsResponse && effectDetailsResponse.success) {
						effectDetailsData = effectDetailsResponse;
					} else {
						effectDetailsData = null;
					}
				} else {
					console.error(
						"LOADER ERROR - Cannot fetch effect details: tenant context is undefined",
					);
					effectDetailsData = null;
				}
			} catch (error) {
				console.error(
					"LOADER ERROR - Failed to fetch effect details data:",
					error,
				);
				effectDetailsData = null;
			}

			// Fetch most damaging events data
			try {
				// Convert filters to the format expected by the most damaging events handler
				const mostDamagingEventsFilters = {
					sectorId: subSectorId || sectorId || null,
					subSectorId: subSectorId || null,
					hazardTypeId: filters.hazardTypeId || null,
					hazardClusterId: filters.hazardClusterId || null,
					specificHazardId: filters.specificHazardId || null,
					geographicLevelId: filters.geographicLevelId || null,
					fromDate: filters.fromDate || null,
					toDate: filters.toDate || null,
					disasterEventId: filters.disasterEventId || null,
					sortBy: "damages",
					sortDirection: "desc",
				};

				// Ensure tenantContext is defined before calling the handler
				if (countryAccountsId) {
					const mostDamagingEventsResponse =
						await handleMostDamagingEventsRequest(
							countryAccountsId,
							mostDamagingEventsFilters,
						);

					if (
						mostDamagingEventsResponse &&
						mostDamagingEventsResponse.success
					) {
						mostDamagingEventsData = mostDamagingEventsResponse;
					} else {
						mostDamagingEventsData = null;
					}
				} else {
					mostDamagingEventsData = null;
				}
			} catch (error) {
				mostDamagingEventsData = null;
			}

			// Fetch related hazard data for cascading filters if specificHazardId is provided
			let relatedHazardData = null;
			try {
				if (filters.specificHazardId) {
					relatedHazardData = await getRelatedHazardDataHandler(
						filters.specificHazardId,
					);
				}
			} catch (error) {
				console.error(
					"LOADER ERROR - Failed to fetch related hazard data:",
					error,
				);
				relatedHazardData = null;
			}		

			return {
				settings,
				currency,
				sectorImpactData,
				hazardImpactData,
				geographicImpactData,
				effectDetailsData,
				mostDamagingEventsData,
				sectorsData: { sectors: sectorsData },
				geographicLevelsData,
				disasterEventsData,
				hazardTypesData,
				hazardClustersData,
				specificHazardsData,
				relatedHazardData,
				damagesGeoData: damagesGeoData,
				lossesGeoData: lossesGeoData,
			};
		} catch (error) {
			console.error("Failed to load sectors analytics data", {
				error: error instanceof Error ? error.message : "Unknown error",
				stack: error instanceof Error ? error.stack : undefined,
				timestamp: new Date().toISOString(),
			});

			// Re-throw the error after logging
			throw error;
		}
	},
);

export const meta: MetaFunction = ({ params }) => {
	const ctx = new ViewContext({ lang: params.lang || "en" });

	return [
		{
			title: htmlTitle(
				ctx,
				ctx.t({
					code: "meta.sectors_analysis",
					msg: "Sectors analysis",
				}),
			),
		},
		{
			name: "description",
			content: ctx.t({
				code: "meta.sectors_analysis",
				msg: "Sectors analysis",
			}),
		},
	];
};

function SectorsAnalysisContent() {
	const ld = useLoaderData<typeof loader>();
	const location = useLocation();
	const ctx = new ViewContext();
	

	// Get data from loader
	const {
		currency,
		sectorImpactData,
		hazardImpactData,
		geographicImpactData,
		effectDetailsData,
		mostDamagingEventsData,
		sectorsData,
		geographicLevelsData,
		disasterEventsData,
		// Destructure hazard-related data
		hazardTypesData,
		hazardClustersData,
		specificHazardsData,
		damagesGeoData,
		lossesGeoData,
	} = ld;

	geographicImpactData;
	const submit = useSubmit();

	// Add loading state to track filter application
	const [pendingFilters, setPendingFilters] = useState<Filters | null>(null);

	const parseFiltersFromSearch = useCallback((search: string): Filters | null => {
		const searchParams = new URLSearchParams(search);
		const toNullable = (key: string) => searchParams.get(key) || null;

		const parsedFilters: Filters = {
			disasterEventId: toNullable("disasterEventId"),
			sectorId: toNullable("sectorId"),
			hazardTypeId: toNullable("hazardTypeId"),
			hazardClusterId: toNullable("hazardClusterId"),
			specificHazardId: toNullable("specificHazardId"),
			geographicLevelId: toNullable("geographicLevelId"),
			fromDate: toNullable("fromDate"),
			toDate: toNullable("toDate"),
			subSectorId: toNullable("subSectorId"),
		};

		const hasAnyFilter = Object.values(parsedFilters).some(
			(value) => value !== null,
		);

		return hasAnyFilter ? parsedFilters : null;
	}, []);

	const urlFilters = useMemo(
		() => parseFiltersFromSearch(location.search),
		[location.search, parseFiltersFromSearch],
	);

	const activeFilters = urlFilters;

	// Apply debounced filters
	useEffect(() => {
		// Create a no-op cleanup function for code paths that don't need cleanup
		const noop = () => { };

		if (pendingFilters !== null) {
			try {
				// Update the URL with new filter parameters
				const url = new URL(window.location.href);

				// Clear existing parameters
				url.searchParams.delete("sectorId");
				url.searchParams.delete("subSectorId");
				url.searchParams.delete("hazardTypeId");
				url.searchParams.delete("hazardClusterId");
				url.searchParams.delete("specificHazardId");
				url.searchParams.delete("geographicLevelId");
				url.searchParams.delete("fromDate");
				url.searchParams.delete("toDate");
				url.searchParams.delete("disasterEventId");

				// Add new parameters if they exist
				if (pendingFilters.sectorId)
					url.searchParams.set("sectorId", pendingFilters.sectorId);
				if (pendingFilters.subSectorId)
					url.searchParams.set("subSectorId", pendingFilters.subSectorId);
				if (pendingFilters.hazardTypeId)
					url.searchParams.set("hazardTypeId", pendingFilters.hazardTypeId);
				if (pendingFilters.hazardClusterId)
					url.searchParams.set(
						"hazardClusterId",
						pendingFilters.hazardClusterId,
					);
				if (pendingFilters.specificHazardId)
					url.searchParams.set(
						"specificHazardId",
						pendingFilters.specificHazardId,
					);
				if (pendingFilters.geographicLevelId)
					url.searchParams.set(
						"geographicLevelId",
						pendingFilters.geographicLevelId,
					);
				if (pendingFilters.fromDate)
					url.searchParams.set("fromDate", pendingFilters.fromDate);
				if (pendingFilters.toDate)
					url.searchParams.set("toDate", pendingFilters.toDate);
				if (pendingFilters.disasterEventId)
					url.searchParams.set(
						"disasterEventId",
						pendingFilters.disasterEventId,
					);

				// Submit the form to trigger a loader reload with the new filters
				const formData = new FormData();
				if (pendingFilters.sectorId)
					formData.append("sectorId", pendingFilters.sectorId);
				if (pendingFilters.subSectorId)
					formData.append("subSectorId", pendingFilters.subSectorId);
				if (pendingFilters.hazardTypeId)
					formData.append("hazardTypeId", pendingFilters.hazardTypeId);
				if (pendingFilters.hazardClusterId)
					formData.append("hazardClusterId", pendingFilters.hazardClusterId);
				if (pendingFilters.specificHazardId)
					formData.append("specificHazardId", pendingFilters.specificHazardId);
				if (pendingFilters.geographicLevelId)
					formData.append(
						"geographicLevelId",
						pendingFilters.geographicLevelId,
					);
				if (pendingFilters.fromDate)
					formData.append("fromDate", pendingFilters.fromDate);
				if (pendingFilters.toDate)
					formData.append("toDate", pendingFilters.toDate);
				if (pendingFilters.disasterEventId)
					formData.append("disasterEventId", pendingFilters.disasterEventId);

				// Submit the form to reload the loader data
				submit(formData, { method: "get", replace: true });

				// Simulate network delay for demonstration
				const timer = setTimeout(() => { }, 500);

				return () => clearTimeout(timer);
			} catch (error) {
				console.error("Error applying filters", {
					error: error instanceof Error ? error.message : "Unknown error",
					stack: error instanceof Error ? error.stack : undefined,
					businessCritical: false,
					operation: "applyFilters",
				});

				return noop; // Return no-op cleanup function in error case
			}
		}
		// Return no-op cleanup function for the case when debouncedFilters is null
		return noop;
	}, [pendingFilters]);

	// Event handlers for Filters component
	const handleApplyFilters = useCallback((newFilters: Filters | null) => {
		setPendingFilters(newFilters);
	}, []);

	const handleClearFilters = useCallback(() => {
		setPendingFilters(null);
	}, []);

	return (
		<MainContainer
			title={ctx.t({ code: "analysis.sectors", msg: "Sectors analysis" })}
			headerExtra={<NavSettings ctx={ctx} />}
		>
			<div style={{ maxWidth: "100%", overflow: "hidden" }}>
				{/* Main content - only shown when JavaScript is enabled */}
				<div className="sectors-page">
					{/* Filters Section */}
					<ErrorBoundary>
						<Filters
							ctx={ctx}
							onApplyFilters={handleApplyFilters}
							onClearFilters={handleClearFilters}
							sectorsData={sectorsData}
							geographicLevelsData={geographicLevelsData}
							disasterEventsData={disasterEventsData}
							hazardTypesData={hazardTypesData}
							hazardClustersData={hazardClustersData}
							specificHazardsData={specificHazardsData}
						/>
					</ErrorBoundary>

					{/* Conditional rendering: Display this message until filters are applied */}
					{!activeFilters && (
						<div
							style={{
								marginTop: "1.43rem",
								textAlign: "center",
								padding: "1.43rem",
								borderRadius: "8px",
								backgroundColor: "#f9f9f9",
								color: "#333",
								fontSize: "1.14rem",
								lineHeight: "1.29rem",
							}}
						>
							<h3
								style={{
									color: "#004f91",
									fontSize: "1.43rem",
									marginBottom: "0.71rem",
								}}
							>
								{ctx.t({
									code: "analysis.welcome_to_sectors_dashboard",
									msg: "Welcome to the sectors dashboard! 🌟",
								})}
							</h3>
							<p>
								{ctx.t({
									code: "analysis.select_and_apply_filters",
									msg: "Please select and apply filters above to view the analysis.",
								})}
							</p>
						</div>
					)}

					{/* Dashboard sections */}
					{activeFilters && (
						<>
							<div
								style={{
									display: "flex",
									justifyContent: "flex-end",
									marginTop: "0.71rem",
									marginBottom: "0.71rem",
									gap: "0.71rem",
								}}
							></div>

							<div
								className="sectors-content"
								style={{
									marginTop: "0.71rem",
									maxWidth: "100%",
									overflow: "hidden",
									position: "relative",
									minHeight: "800px", // Prevent layout shift
								}}
							>
								{/* Impact on Selected Sector */}
								{activeFilters.sectorId && (
									<div className="space-y-8" style={{ minHeight: "300px" }}>
										<ErrorBoundary>
											<ImpactOnSector
												ctx={ctx}
												sectorId={activeFilters.sectorId}
												filters={activeFilters}
												currency={currency}
												sectorImpactData={sectorImpactData}
												sectorsData={sectorsData}
											/>
										</ErrorBoundary>
									</div>
								)}

								{/* Impact by Hazard Section */}
								<div style={{ minHeight: "400px" }}>
									<ErrorBoundary>
										<ImpactByHazard
											ctx={ctx}
											filters={activeFilters}
											currency={currency}
											hazardImpactData={hazardImpactData}
											sectorsData={sectorsData}
										/>
									</ErrorBoundary>
								</div>

								{/* Impact by geographic level */}
								<div style={{ minHeight: "500px" }}>
									<ErrorBoundary>
										<ImpactMap
											ctx={ctx}
											filters={activeFilters}
											currency={currency}
											geographicImpactData={
												{
													damagesGeoData: damagesGeoData,
													lossesGeoData: lossesGeoData,
												}
											}
											sectorsData={sectorsData}
										/>
									</ErrorBoundary>
								</div>

								{/* Effect details Section */}
								<div style={{ minHeight: "400px" }}>
									<ErrorBoundary>
										<EffectDetails
											ctx={ctx}
											filters={activeFilters}
											currency={currency}
											effectDetailsData={effectDetailsData}
											sectorsData={sectorsData}
										/>
									</ErrorBoundary>
								</div>

								{/* Most damaging events Section */}
								<div style={{ minHeight: "300px" }}>
									<ErrorBoundary>
										<MostDamagingEvents
											ctx={ctx}
											filters={activeFilters}
											currency={currency}
											mostDamagingEventsData={mostDamagingEventsData}
											sectorsData={sectorsData}
										/>
									</ErrorBoundary>
								</div>
							</div>
						</>
					)}

					<p></p>
					<div className="dts-caption mt-4">
						<p>
							{"* " +
								ctx.t({
									code: "analysis.data_based_on_published_records",
									msg: "Data shown is based on published records",
								})}
						</p>
					</div>
				</div>
			</div>
		</MainContainer>
	);
}

// Wrapper component that provides QueryClient
export default function SectorsAnalysis() {
	return <SectorsAnalysisContent />;
}
