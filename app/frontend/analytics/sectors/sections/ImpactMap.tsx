import { useState, useEffect, useRef } from "react";
import type { MetricConfig } from "~/components/CustomMap";
import { ViewContext } from "~/frontend/context";
import MapChart, { MapChartRef } from "~/components/MapChart";

interface Sector {
	id: string;
	sectorname: string;
	subsectors?: Sector[];
}

interface interfaceMap {
	total: number;
	name: string;
	description: string;
	colorPercentage: number;
	geojson: any;
}

// Define the filter shape to match ImpactMapOl props
type FilterValues = {
	sectorId: string | null;
	subSectorId: string | null;
	hazardTypeId: string | null;
	hazardClusterId: string | null;
	specificHazardId: string | null;
	geographicLevelId: string | null;
	fromDate: string | null;
	toDate: string | null;
	disasterEventId: string | null;
	assessmentType?: "rapid" | "detailed";
	confidenceLevel?: "low" | "medium" | "high";
};

type Filters = FilterValues | null;

type ImpactMapProps = {
	ctx: ViewContext;
	filters: Filters;
	currency?: string;
	geographicImpactData: {
		damagesGeoData: any;
		lossesGeoData: any;
	};
	sectorsData?: { sectors: Sector[] | null };
	// New props for extended functionality
	availableMetrics?: string[];
	defaultMetric?: string;
	metricConfigs?: Record<string, MetricConfig>;
};

const EMPTY_GEO_DATA: interfaceMap[] = [];

const DEFAULT_FILTERS: FilterValues = {
	sectorId: null,
	subSectorId: null,
	hazardTypeId: null,
	hazardClusterId: null,
	specificHazardId: null,
	geographicLevelId: null,
	fromDate: null,
	toDate: null,
	disasterEventId: null,
	assessmentType: "rapid",
	confidenceLevel: "low",
};

// Define default metric configs that will be updated with the correct currency
const getDefaultMetricConfigs = (
	ctx: ViewContext,
	currency: string,
): Record<string, MetricConfig> => ({
	totalDamage: {
		type: "monetary" as const,
		label: ctx.t({
			code: "analysis.total_damages",
			msg: "Total damages",
		}),
		currency,
	},
	totalLoss: {
		type: "monetary" as const,
		label: ctx.t({
			code: "analysis.total_losses",
			msg: "Total losses",
		}),
		currency,
	},
});

export default function ImpactMap({
	ctx,
	filters = DEFAULT_FILTERS,
	currency = "USD",
	geographicImpactData,
	sectorsData,
	availableMetrics = ["totalDamage", "totalLoss"],
	defaultMetric = "totalDamage",
	metricConfigs,
}: ImpactMapProps) {
	// Use the provided metricConfigs or generate default ones with the correct currency
	const effectiveMetricConfigs =
		metricConfigs || getDefaultMetricConfigs(ctx, currency);
	const mapChartRef = useRef<MapChartRef>(null); //  Reference to MapChart
	const initialMetric = availableMetrics.includes(defaultMetric)
		? defaultMetric
		: availableMetrics[0] || "totalDamage";
	const initialTabIndex = Math.max(availableMetrics.indexOf(initialMetric), 0);

	const [selectedTab, setSelectedTab] = useState<string>(
		`tab${(initialTabIndex + 1).toString().padStart(2, "0")}`,
	); // Add back selectedTab
	const [, setError] = useState<string | null>(null);

	// Use sectors data from props for dynamic titles
	const sectors = sectorsData?.sectors || [];

	// Function to get sector with parent
	const findSectorWithParent = (
		sectors: Sector[],
		targetId: string,
	): { sector: Sector | undefined; parent: Sector | undefined } => {
		for (const sector of sectors) {
			if (sector.id.toString() === targetId) {
				return { sector, parent: undefined };
			}
			if (sector.subsectors) {
				const subsector = sector.subsectors.find(
					(sub) => sub.id.toString() === targetId,
				);
				if (subsector) {
					return { sector: subsector, parent: sector };
				}
			}
		}
		return { sector: undefined, parent: undefined };
	};

	// Function to get section title based on selected sector
	const sectionTitle = () => {
		if (!sectors || sectors.length === 0) {
			return ctx.t({
				code: "analysis.impact_by_geographic_level",
				msg: "Impact by geographic level",
			});
		}

		if (filters?.sectorId) {
			const { sector } = findSectorWithParent(sectors, filters.sectorId);

			if (filters?.subSectorId && sector) {
				const { sector: subsector, parent: mainSector } = findSectorWithParent(
					sectors,
					filters.subSectorId,
				);
				if (subsector && mainSector) {
					return ctx.t(
						{
							code: "analysis.impact_in_subsector_by_geographic_level",
							desc: "Title for impact analysis in a subsector under a main sector, broken down by geographic level. {subsector} is the subsector name, {sector} is the main sector name.",
							msg: "Impact in {subsector} ({sector} Sector) by Geographic level",
						},
						{ subsector: subsector.sectorname, sector: mainSector.sectorname },
					);
				}
			}

			if (sector) {
				return ctx.t(
					{
						code: "analysis.impact_in_sector_by_geographic_level",
						desc: "Title for impact analysis in a sector, broken down by geographic level. {sector} is the name of the sector.",
						msg: "Impact in {sector} Sector by Geographic level",
					},
					{ sector: sector.sectorname },
				);
			}
		}
		return ctx.t({
			code: "analysis.impact_by_geographic_level",
			msg: "Impact by geographic level",
		});
	};

	// Get display label for metric with unit info
	const getMetricDisplayLabel = (metric: string) => {
		const config = effectiveMetricConfigs[metric];
		if (!config) return metric;

		if (config.type === "monetary") {
			const currencyCode = config.currency || currency;
			return ctx.t(
				{
					code: "analysis.metric_in_currency",
					desc: "Displays a metric label followed by the currency. {label} is the metric (e.g. Total damages), {currency} is the currency code (e.g. USD).",
					msg: "{label} in {currency}",
				},
				{ label: config.label, currency: currencyCode },
			);
		} else if (config.unit) {
			return `${config.label} (${config.unit})`;
		} else {
			return config.label;
		}
	};

	const damageLegendTitle = ctx.t({
		code: "analysis.total_damage",
		msg: "Total damage",
	});
	const lossesLegendTitle = ctx.t({
		code: "analysis.total_losses",
		msg: "Total losses",
	});

	// Handle tab selection - Fixed to prevent infinite loop
	const handleSelectTab = (tabId: string, metric: string) => {
		setSelectedTab(tabId);
		if (metric === "totalDamage") {
			setActiveMapLayer("damage");
			// setActiveData(geographicImpactData.damagesGeoData ?? []);
			// mapChartRef.current?.setDataSource(geographicImpactData.damagesGeoData ?? []);
			// mapChartRef.current?.setLegendTitle(damageLegendTitle);
			// mapChartRef.current?.setLegendMaxColor("#208f04");
		}
		if (metric === "totalLoss") {
			setActiveMapLayer("losses");
			// setActiveData(geographicImpactData.lossesGeoData ?? []);
			// mapChartRef.current?.setDataSource(geographicImpactData.lossesGeoData ?? []);
			// mapChartRef.current?.setLegendTitle(lossesLegendTitle);
			// mapChartRef.current?.setLegendMaxColor("#58508d");
		}
	};

	const safeDamagesGeoData =
		geographicImpactData.damagesGeoData ?? EMPTY_GEO_DATA;
	const safeLossesGeoData =
		geographicImpactData.lossesGeoData ?? EMPTY_GEO_DATA;
	const [activeMapLayer, setActiveMapLayer] = useState<"damage" | "losses">(
		initialMetric === "totalLoss" ? "losses" : "damage",
	);
	const activeData =
		activeMapLayer === "losses" ? safeLossesGeoData : safeDamagesGeoData;

	// Set error message if there's an issue with the data
	useEffect(() => {
		setError(null); // Reset error whenever geographicImpactData changes
	}, [geographicImpactData]);

	useEffect(() => {
		const nextLegendTitle =
			activeMapLayer === "losses" ? lossesLegendTitle : damageLegendTitle;
		const nextLegendColor = activeMapLayer === "losses" ? "#58508d" : "#208f04";

		mapChartRef.current?.setDataSource(activeData);
		mapChartRef.current?.setLegendTitle(nextLegendTitle);
		mapChartRef.current?.setLegendMaxColor(nextLegendColor);
	}, [
		activeMapLayer,
		activeData,
		damageLegendTitle,
		lossesLegendTitle,
	]);

	return (
		<section className="dts-page-section">
			<div className="mg-container">
				<h2 className="dts-heading-2">{sectionTitle()}</h2>
				<p className="dts-body-text mb-6">
					{ctx.t({
						code: "analysis.distribution_of_impacts_geographic_levels",
						msg: "Distribution of impacts across different geographic levels",
					})}
				</p>

				<div className="map-section">
					<h2 className="mg-u-sr-only" id="tablist01">
						{ctx.t({
							code: "analysis.geographic_impact_view",
							msg: "Geographic impact view",
						})}
					</h2>

					{/* Dynamic metric selector based on available metrics */}
					<ul
						className="dts-tablist"
						role="tablist"
						aria-labelledby="tablist01"
					>
						{availableMetrics.map((metric, index) => {
							const tabId = `tab${(index + 1).toString().padStart(2, "0")}`;

							return (
								<li key={metric} role="presentation">
									<button
										className={`dts-tablist__button ${selectedTab === tabId ? "active" : ""}`}
										type="button"
										role="tab"
										id={tabId}
										aria-controls="tabpanel01"
										aria-selected={selectedTab === tabId}
										tabIndex={selectedTab === tabId ? 0 : -1}
										onClick={() => handleSelectTab(tabId, metric)}
									>
										<span>{getMetricDisplayLabel(metric)}</span>
									</button>
								</li>
							);
						})}
					</ul>

					{/* Single tab panel that updates based on selected metric */}
					<div id="tabpanel01" role="tabpanel" aria-labelledby={selectedTab}>
						<MapChart
							ctx={ctx}
							ref={mapChartRef}
							id="map_viewer"
							dataSource={activeData}
							mapMode="light"
							legendTitle={ctx.t({
								code: "analysis.total_damage",
								msg: "Total damage",
							})}
							legendMaxColor="#208f04"
						/>
					</div>
				</div>
			</div>
		</section>
	);
}
