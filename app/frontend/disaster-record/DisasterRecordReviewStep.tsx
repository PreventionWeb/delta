import { Fragment, useEffect, useMemo, useRef } from "react";
import { Card } from "primereact/card";
import { ViewContext } from "~/frontend/context";
import { formatDate } from "~/utils/date";
import { LangLink } from "~/utils/link";
import AuditLogHistory from "~/components/AuditLogHistory";
import { SectorEffectsTable } from "~/frontend/disaster-record/SectorEffectsTable";

const glbMapperJS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const glbMapperCSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

const ensureLeafletLoaded = (() => {
	let promise: Promise<any> | null = null;
	return () => {
		if (typeof window === "undefined") {
			return Promise.resolve(null);
		}

		if ((window as any).L) {
			return Promise.resolve((window as any).L);
		}

		if (promise) {
			return promise;
		}

		promise = new Promise((resolve) => {
			if (!document.querySelector(`link[href="${glbMapperCSS}"]`)) {
				const leafletCSS = document.createElement("link");
				leafletCSS.rel = "stylesheet";
				leafletCSS.href = glbMapperCSS;
				document.head.appendChild(leafletCSS);
			}

			const script = document.createElement("script");
			script.src = glbMapperJS;
			script.async = true;
			script.onload = () => resolve((window as any).L || null);
			document.head.appendChild(script);
		});

		return promise;
	};
})();

const LOCATION_LEVEL_COLORS = [
	{ stroke: "#0f4c81", fill: "#dbeafe" },
	{ stroke: "#1d7a46", fill: "#dcfce7" },
	{ stroke: "#92400e", fill: "#fef3c7" },
	{ stroke: "#7e22ce", fill: "#f3e8ff" },
	{ stroke: "#b91c1c", fill: "#fee2e2" },
];

function levelRank(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const trimmed = value.trim().toLowerCase();
		if (trimmed.length === 0) {
			return 999;
		}

		const numeric = Number(trimmed);
		if (Number.isFinite(numeric)) {
			return numeric;
		}

		if (trimmed.includes("country") || trimmed === "0") {
			return 0;
		}

		const adminMatch = trimmed.match(/admin\s*(\d+)/);
		if (adminMatch) {
			return Number(adminMatch[1]);
		}
	}

	return 999;
}

function ReviewLocationMap({
	ctx,
	spatialFootprintData,
}: {
	ctx: ViewContext;
	spatialFootprintData: any[];
}) {
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<any>(null);

	const mapLayers = useMemo(() => {
		const input = Array.isArray(spatialFootprintData)
			? spatialFootprintData
			: [];

		const geographicItems = input
			.filter(
				(item) =>
					item?.map_option === "Geographic level" &&
					item?.geojson &&
					typeof item.geojson === "object",
			)
			.map((item, index) => {
				const levelValue =
					item?.geojson?.properties?.level ??
					item?.geographic_level ??
					item?.title ??
					`level-${index}`;
				return {
					key: String(levelValue),
					rank: levelRank(levelValue),
					geojson: item.geojson,
				};
			})
			.sort((a, b) => a.rank - b.rank);

		const levelKeys = Array.from(
			new Set(geographicItems.map((item) => item.key)),
		);
		const levelColorByKey = new Map(
			levelKeys.map((key, index) => [
				key,
				LOCATION_LEVEL_COLORS[index % LOCATION_LEVEL_COLORS.length],
			]),
		);

		const styledGeographic = geographicItems.map((item) => ({
			kind: "geographic" as const,
			geojson: item.geojson,
			style: {
				color: levelColorByKey.get(item.key)?.stroke || "#0f4c81",
				fillColor: levelColorByKey.get(item.key)?.fill || "#dbeafe",
				weight: 1.5,
				fillOpacity: 0.28,
			},
		}));

		const footprintItems = input
			.filter((item) => {
				if (!item?.geojson || typeof item.geojson !== "object") {
					return false;
				}
				const mapOption =
					typeof item?.map_option === "string" ? item.map_option : "";
				return mapOption !== "Geographic level";
			})
			.map((item) => ({
				kind: "footprint" as const,
				geojson: item.geojson,
				style: {
					color: "#1d4ed8",
					fillColor: "#60a5fa",
					weight: 2,
					fillOpacity: 0.2,
				},
			}));

		return [...styledGeographic, ...footprintItems];
	}, [spatialFootprintData]);

	useEffect(() => {
		if (mapLayers.length === 0 || !mapContainerRef.current) {
			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}
			return;
		}

		let cancelled = false;
		ensureLeafletLoaded().then((L) => {
			if (cancelled || !L || !mapContainerRef.current) {
				return;
			}

			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}

			const map = L.map(mapContainerRef.current, { preferCanvas: true });
			mapRef.current = map;

			L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
				attribution: "",
			}).addTo(map);

			const bounds = L.latLngBounds([]);

			for (const entry of mapLayers) {
				const layer = L.geoJSON(entry.geojson, {
					style: () => entry.style,
					pointToLayer: (_feature: any, latlng: any) =>
						L.circleMarker(latlng, {
							radius: 6,
							color: entry.style.color,
							fillColor: entry.style.fillColor,
							fillOpacity: 0.8,
							weight: 1.5,
						}),
				});
				layer.addTo(map);
				try {
					const layerBounds = layer.getBounds?.();
					if (layerBounds && layerBounds.isValid()) {
						bounds.extend(layerBounds);
					}
				} catch {
					// Ignore invalid bounds and keep rendering remaining layers.
				}
			}

			if (bounds.isValid()) {
				map.fitBounds(bounds, { padding: [24, 24] });
			} else {
				map.setView([0, 0], 2);
			}

			setTimeout(() => {
				map.invalidateSize();
			}, 0);
		});

		return () => {
			cancelled = true;
			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, [mapLayers]);

	if (mapLayers.length === 0) {
		return null;
	}

	return (
		<div className="space-y-2">
			<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
				{ctx.t({
					code: "disaster_event.review.map",
					msg: "Map",
				})}
			</p>
			<div
				ref={mapContainerRef}
				className="h-80 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
			/>
		</div>
	);
}

function extensionFromName(fileName: string): string {
	const segments = fileName.split(".");
	if (segments.length < 2) return "";
	return segments[segments.length - 1].toLowerCase();
}

function formatFileSize(fileSize: number): string {
	if (!Number.isFinite(fileSize) || fileSize <= 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB"];
	let unitIndex = 0;
	let value = fileSize;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	const fixed =
		value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
	return `${fixed} ${units[unitIndex]}`;
}

function getFileIconClass(fileName: string): string {
	const ext = extensionFromName(fileName);

	if (["pdf"].includes(ext)) return "pi pi-file-pdf";
	if (["doc", "docx"].includes(ext)) return "pi pi-file-word";
	if (["xls", "xlsx"].includes(ext)) return "pi pi-file-excel";
	if (["ppt", "pptx"].includes(ext)) return "pi pi-file";
	if (["jpg", "png", "gif", "webp"].includes(ext)) return "pi pi-image";
	if (["mp3", "wav", "m4a"].includes(ext)) return "pi pi-volume-up";
	if (["mp4", "mov"].includes(ext)) return "pi pi-video";

	return "pi pi-file";
}

function localizedText(value: any, lang: string): string {
	if (!value) return "";
	if (typeof value === "string") return value;
	if (typeof value === "object") {
		return value[lang] || value.en || Object.values(value)[0] || "";
	}
	return String(value);
}

function renderMultilineText(value: string | null | undefined) {
	if (!value) return "-";
	return value.split(/\r?\n/).map((line, index) => (
		<Fragment key={`${index}-${line}`}>
			{index > 0 && <br />}
			<span>{line}</span>
		</Fragment>
	));
}

const renderReviewItem = (label: string, value: string) => (
	<div className="space-y-1">
		<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
			{label}
		</p>
		<p className="text-[14px] leading-[18px] font-semibold text-slate-800">
			{value || "-"}
		</p>
	</div>
);

const renderSectionCard = (
	title: string,
	iconClass: string,
	emptyLabel: string,
	content: React.ReactNode,
	hasItems: boolean,
) => (
	<Card
		className="rounded-2xl border border-slate-200 shadow-none"
		pt={{ body: { style: { padding: "18px 20px" } } }}
	>
		<div className="space-y-4">
			<div className="flex items-center gap-2 text-slate-800">
				<i className={iconClass} />
				<h4 className="text-[18px] leading-[24px] font-semibold">{title}</h4>
			</div>
			{hasItems ? (
				<div className="space-y-5">{content}</div>
			) : (
				<p className="text-[14px] italic text-slate-400">{emptyLabel}</p>
			)}
		</div>
	</Card>
);

export interface ParsedAttachment {
	id: string;
	title: string;
	tags: string[];
	isLink: boolean;
	fileName: string;
	fileSize: number;
	fileType: string;
	href: string;
	displayUrl: string;
	linkUrl: string;
}

export function parseAttachments(
	rawAttachments: unknown,
	recordId: string,
	ctx: ViewContext,
	locationType: "record" | "event",
): ParsedAttachment[] {
	let rawList: any[] = [];
	if (Array.isArray(rawAttachments)) {
		rawList = rawAttachments;
	} else if (typeof rawAttachments === "string" && rawAttachments.trim()) {
		try {
			const parsed = JSON.parse(rawAttachments);
			rawList = Array.isArray(parsed) ? parsed : [];
		} catch {
			rawList = [];
		}
	}

	return rawList.map((att: any, idx: number) => {
		const id = att.id || `att-${idx}`;
		const title = att.title || "";

		// Parse tags
		let tags: string[] = [];
		if (Array.isArray(att.tag)) {
			tags = att.tag
				.map((t: any) =>
					typeof t === "string" ? t : t?.name || t?.label || String(t || ""),
				)
				.filter(Boolean);
		} else if (typeof att.tag === "string" && att.tag.trim()) {
			try {
				const parsedTags = JSON.parse(att.tag);
				if (Array.isArray(parsedTags)) {
					tags = parsedTags
						.map((t: any) =>
							typeof t === "string"
								? t
								: t?.name || t?.label || String(t || ""),
						)
						.filter(Boolean);
				} else {
					tags = [att.tag];
				}
			} catch {
				tags = [att.tag];
			}
		}

		// Determine if File or Link
		const isLink =
			att.file_option === "Link" ||
			(!att.file_option && att.url && !att.file && !att.fileName);

		const rawFileName =
			att.file?.name ||
			(typeof att.file === "string" ? att.file : "") ||
			att.fileName ||
			att.name ||
			"";
		const fileName = rawFileName
			? rawFileName.split("/").pop() || rawFileName
			: "";

		const fileSize =
			typeof att.file?.size === "number"
				? att.file.size
				: typeof att.fileSize === "number"
					? att.fileSize
					: typeof att.size === "number"
						? att.size
						: 0;

		const fileType = att.file?.type || att.fileType || att.type || "";
		const fileKey = att.fileKey || "";

		const fileViewerPath =
			locationType === "record"
				? `/disaster-record/file-viewer?name=${encodeURIComponent(fileKey || `${recordId}/${fileName}`)}&loc=record`
				: `/hazardous-event/file-viewer?name=${encodeURIComponent(fileKey || `${recordId}/${fileName}`)}&loc=event`;

		const href = ctx.url(fileViewerPath);

		const displayUrl = att.url || att.href || "";
		const linkUrl = displayUrl
			? displayUrl.startsWith("http://") || displayUrl.startsWith("https://")
				? displayUrl
				: `https://${displayUrl}`
			: "";

		return {
			id,
			title,
			tags,
			isLink,
			fileName,
			fileSize,
			fileType,
			href,
			displayUrl,
			linkUrl,
		};
	});
}

export interface HumanEffectsTotals {
	deaths?: number | string | boolean | null;
	injured?: number | string | boolean | null;
	missing?: number | string | boolean | null;
	directlyAffected?: number | string | boolean | null;
	indirectlyAffected?: number | string | boolean | null;
	displaced?: number | string | boolean | null;
}

export interface DisasterRecordReviewStepProps {
	ctx: ViewContext;
	item: {
		id: string;
		disasterEventId?: string | null;
		cpDisplayName?: string | null;
		locationDesc?: string | null;
		startDate?: string | null;
		endDate?: string | null;
		localWarnInst?: string | null;
		primaryDataSource?: string | null;
		otherDataSource?: string | null;
		fieldAssessDate?: string | null;
		assessmentModes?: string | null;
		originatorRecorderInst?: string | null;
		validatedBy?: string | null;
		checkedBy?: string | null;
		dataCollector?: string | null;
		createdAt?: string | Date | null;
		updatedAt?: string | Date | null;
		approvalStatus?: string | null;
		hipHazard?: any;
		hipCluster?: any;
		hipType?: any;
		spatialFootprint?: any[];
		attachments?: unknown;
		disasterRecord?: any[];
		humanEffectsTotals?: HumanEffectsTotals;
	};
	humanEffectsTotals?: HumanEffectsTotals;
	humanEffectsDisaggregation?: any[];
	recordsDisRecSectors?: any[];
	recordsNonecoLosses?: any[];
	auditLogs?: any[];
}

export default function DisasterRecordReviewStep({
	ctx,
	item,
	humanEffectsTotals: propsTotals,
	humanEffectsDisaggregation = [],
	recordsDisRecSectors = [],
	recordsNonecoLosses = [],
	auditLogs,
}: DisasterRecordReviewStepProps) {
	const lang = ctx.lang || "en";

	const formatReviewDate = (val: unknown): string => {
		if (!val) return "-";
		const formatted = formatDate(val as any);
		return formatted || "-";
	};

	// Hazard details
	const hazardTypeName = localizedText(item.hipType?.name, lang);
	const hazardClusterName = localizedText(item.hipCluster?.name, lang);
	const specificHazardBaseName = localizedText(item.hipHazard?.name, lang);
	const specificHazardCode = item.hipHazard?.code;
	const specificHazardDisplay = [
		specificHazardBaseName,
		specificHazardCode ? `(${specificHazardCode})` : "",
	]
		.filter(Boolean)
		.join(" ");

	// Divisions and spatial footprints
	const spatialList = Array.isArray(item.spatialFootprint)
		? item.spatialFootprint
		: [];
	const divisionPills = spatialList
		.filter((sp) => sp?.map_option === "Geographic level")
		.map((sp, idx) => ({
			key: sp.id || `div-${idx}`,
			label: sp.geographic_level || sp.title || `Division ${idx + 1}`,
		}));

	const footprintItems = spatialList
		.filter((sp) => sp?.map_option !== "Geographic level")
		.map((sp, idx) => sp.title || `Spatial footprint ${idx + 1}`);

	// Attachments
	const attachmentsList = useMemo(() => {
		return parseAttachments(item.attachments, item.id, ctx, "record");
	}, [item.attachments, item.id, ctx]);

	// Human effects totals
	const totals = propsTotals || item.humanEffectsTotals || {};
	const formatKpiNumber = (val: unknown) => {
		if (
			val === null ||
			val === undefined ||
			val === "" ||
			val === false ||
			val === "false"
		) {
			return "-";
		}
		if (val === true || val === "true") {
			return ctx.t({ code: "common.yes", msg: "Yes" });
		}
		if (typeof val === "number") return val.toLocaleString();
		return String(val);
	};

	const kpiItems = [
		{
			key: "deaths",
			label: ctx.t({ code: "human_effects.deaths", msg: "Deaths" }),
			value: formatKpiNumber(totals.deaths),
		},
		{
			key: "injured",
			label: ctx.t({ code: "human_effects.injured", msg: "Injured" }),
			value: formatKpiNumber(totals.injured),
		},
		{
			key: "missing",
			label: ctx.t({ code: "human_effects.missing", msg: "Missing" }),
			value: formatKpiNumber(totals.missing),
		},
		{
			key: "directlyAffected",
			label: ctx.t({
				code: "human_effects.directly_affected",
				msg: "Directly",
			}),
			value: formatKpiNumber(totals.directlyAffected),
		},
		{
			key: "indirectlyAffected",
			label: ctx.t({
				code: "human_effects.indirectly_affected",
				msg: "Indirectly",
			}),
			value: formatKpiNumber(totals.indirectlyAffected),
		},
		{
			key: "displaced",
			label: ctx.t({ code: "human_effects.displaced", msg: "Displaced" }),
			value: formatKpiNumber(totals.displaced),
		},
	];

	const hasDisaggregation =
		Array.isArray(humanEffectsDisaggregation) &&
		humanEffectsDisaggregation.some((t) => t.rows && t.rows.length > 0);

	return (
		<div className="space-y-6">
			{/* Card 1: Basic Information */}
			<Card
				className="rounded-2xl border border-slate-200 shadow-none"
				pt={{ body: { style: { padding: "18px 20px" } } }}
			>
				<div className="space-y-6">
					<div className="flex items-center gap-2 text-slate-800">
						<i className="pi pi-info-circle text-blue-600" />
						<h4 className="text-[16px] leading-[16px] font-semibold">
							{ctx.t({
								code: "disaster_event.review.basic_information",
								msg: "Basic information",
							})}
						</h4>
					</div>
					<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
						{renderReviewItem(
							ctx.t({
								code: "common.uuid",
								msg: "Disaster record UUID",
							}),
							item.id || "-",
						)}
						<div className="space-y-1">
							<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
								{ctx.t({
									code: "disaster_event",
									msg: "Disaster event",
								})}
							</p>
							{item.disasterEventId ? (
								<LangLink
									lang={ctx.lang}
									to={`/disaster-event/${item.disasterEventId}`}
									className="text-[14px] leading-[18px] font-semibold text-blue-700 hover:text-blue-800 hover:underline"
								>
									{item.cpDisplayName || item.disasterEventId}
								</LangLink>
							) : (
								<p className="text-[14px] leading-[18px] font-semibold text-slate-800">
									{item.cpDisplayName || "-"}
								</p>
							)}
						</div>
						{renderReviewItem(
							ctx.t({
								code: "disaster_record.recording_institution",
								msg: "Recording institution",
							}),
							item.originatorRecorderInst || "-",
						)}
						{renderReviewItem(
							ctx.t({
								code: "disaster_record.data_collector",
								msg: "Data collector",
							}),
							item.dataCollector || "-",
						)}
						{renderReviewItem(
							ctx.t({
								code: "disaster_record.checked_by",
								msg: "Checked by",
							}),
							item.checkedBy || "-",
						)}
						{renderReviewItem(
							ctx.t({
								code: "disaster_record.validated_by",
								msg: "Validated by",
							}),
							item.validatedBy || "-",
						)}
						{renderReviewItem(
							ctx.t({
								code: "disaster_record.primary_data_source",
								msg: "Primary data source",
							}),
							item.primaryDataSource || "-",
						)}
						{renderReviewItem(
							ctx.t({
								code: "disaster_record.other_data_source",
								msg: "Other data sources",
							}),
							item.otherDataSource || "-",
						)}
						{renderReviewItem(
							ctx.t({
								code: "disaster_record.field_assessment_date",
								msg: "Field assessment conducted",
							}),
							formatReviewDate(item.fieldAssessDate),
						)}
						{renderReviewItem(
							ctx.t({
								code: "common.created_at",
								msg: "Created at",
							}),
							formatReviewDate(item.createdAt),
						)}
						{item.updatedAt
							? renderReviewItem(
									ctx.t({
										code: "common.updated_at",
										msg: "Updated at",
									}),
									formatReviewDate(item.updatedAt),
								)
							: null}
					</div>
					{item.assessmentModes ? (
						<div className="space-y-1">
							<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
								{ctx.t({
									code: "disaster_record.assessment_modes",
									msg: "Assessments methodologies",
								})}
							</p>
							<p className="text-[14px] leading-relaxed text-slate-700 whitespace-pre-line">
								{item.assessmentModes}
							</p>
						</div>
					) : null}
					{item.localWarnInst ? (
						<div className="space-y-1">
							<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
								{ctx.t({
									code: "disaster_record.local_warning_instructions",
									msg: "Local warning and local instructions (recommended actions)",
								})}
							</p>
							<p className="text-[14px] leading-relaxed text-slate-700 whitespace-pre-line">
								{item.localWarnInst}
							</p>
						</div>
					) : null}
				</div>
			</Card>

			{/* Card 2: Hazard details */}
			<Card
				className="rounded-2xl border border-slate-200 shadow-none"
				pt={{ body: { style: { padding: "18px 20px" } } }}
			>
				<div className="space-y-6">
					<div className="flex items-center gap-2 text-slate-800">
						<i className="pi pi-map-marker text-blue-600" />
						<h4 className="text-[16px] leading-[16px] font-semibold">
							{ctx.t({
								code: "disaster_event.review.hazard_details",
								msg: "Hazard details",
							})}
						</h4>
					</div>
					<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
						{renderReviewItem(
							ctx.t({ code: "hip.hazard_type", msg: "Hazard type" }),
							hazardTypeName || "-",
						)}
						{renderReviewItem(
							ctx.t({ code: "hip.hazard_cluster", msg: "Hazard cluster" }),
							hazardClusterName || "-",
						)}
						{renderReviewItem(
							ctx.t({
								code: "hip.specific_hazard",
								msg: "Specific hazard",
							}),
							specificHazardDisplay || "-",
						)}
						{renderReviewItem(
							ctx.t({
								code: "disaster_record.location_description",
								msg: "Location description",
							}),
							item.locationDesc || "-",
						)}
					</div>
					<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
						{renderReviewItem(
							ctx.t({ code: "common.start_date", msg: "Start date" }),
							formatReviewDate(item.startDate),
						)}
						{renderReviewItem(
							ctx.t({ code: "common.end_date", msg: "End date" }),
							formatReviewDate(item.endDate),
						)}
					</div>
				</div>
			</Card>

			{/* Card 3: Location */}
			{renderSectionCard(
				ctx.t({
					code: "disaster_event.review.location",
					msg: "Location",
				}),
				"pi pi-map-marker text-blue-600",
				ctx.t({
					code: "disaster_event.review.no_location_details",
					msg: "No location details available",
				}),
				<>
					<div className="space-y-2">
						<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
							{ctx.t({
								code: "spatial_footprint.geographic_levels",
								msg: "Geographic levels",
							})}
						</p>
						{divisionPills.length > 0 ? (
							<div className="flex flex-wrap gap-2">
								{divisionPills.map((div) => (
									<span
										key={div.key}
										className="rounded-md bg-blue-50 px-2 py-1 text-[12px] text-blue-700 font-medium"
									>
										{div.label}
									</span>
								))}
							</div>
						) : (
							<p className="text-[14px] italic text-slate-400">
								{ctx.t({
									code: "disaster_event.review.no_geographic_levels",
									msg: "No geographic levels selected",
								})}
							</p>
						)}
					</div>

					{footprintItems.length > 0 ? (
						<div className="space-y-2">
							<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
								{ctx.t({
									code: "common.spatial_footprint",
									msg: "Spatial footprint",
								})}
							</p>
							<ul className="list-disc pl-5 text-[14px] text-slate-600 space-y-1">
								{footprintItems.map((title, idx) => (
									<li key={`fp-${idx}`}>{title}</li>
								))}
							</ul>
						</div>
					) : null}

					<ReviewLocationMap
						ctx={ctx}
						spatialFootprintData={item.spatialFootprint || []}
					/>
				</>,
				divisionPills.length > 0 || footprintItems.length > 0,
			)}

			{/* Card 4: Human effects */}
			<Card
				className="rounded-2xl border border-slate-200 shadow-none"
				pt={{ body: { style: { padding: "18px 20px" } } }}
			>
				<div className="space-y-5">
					<div className="flex items-center gap-2 text-slate-800">
						<i className="pi pi-users text-blue-600" />
						<h4 className="text-[18px] leading-[24px] font-semibold">
							{ctx.t({ code: "human_effects", msg: "Human effects" })}
						</h4>
					</div>

					{/* Top Summary KPI metric chips */}
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
						{kpiItems.map((kpi) => (
							<div
								key={kpi.key}
								className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-3"
							>
								<span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
									{kpi.label}
								</span>
								<span className="mt-1 text-xl font-bold text-slate-800">
									{kpi.value}
								</span>
							</div>
						))}
					</div>

					{/* Disaggregation tables */}
					{hasDisaggregation && (
						<div className="mt-5 space-y-4">
							<p className="text-sm font-extrabold text-gray-700">
								{ctx.t({
									code: "human_effects.disaggregation_details",
									msg: "Disaggregation details",
								})}
							</p>
							{humanEffectsDisaggregation
								.filter((table) => table.rows && table.rows.length > 0)
								.map((table) => (
									<div key={table.tableId} className="space-y-1">
										<h5 className="text-sm font-semibold text-gray-700">
											{table.label}
										</h5>
										<div className="overflow-x-auto">
											<table className="w-full border border-gray-300 text-xs">
												<thead className="bg-gray-50 text-gray-700">
													<tr>
														{table.defs.map((def: any) => {
															const label =
																typeof def.uiName === "string"
																	? def.uiName
																	: (def.uiName as any)?.msg || def.dbName;
															return (
																<th
																	key={def.dbName}
																	className="border border-gray-300 px-2 py-1 text-left font-medium"
																>
																	{label}
																</th>
															);
														})}
													</tr>
												</thead>
												<tbody>
													{table.rows.map((row: any[], rIdx: number) => (
														<tr key={rIdx} className="hover:bg-gray-50">
															{row.map((val: any, cIdx: number) => (
																<td
																	key={`${table.tableId}-${rIdx}-${cIdx}`}
																	className="border border-gray-300 px-2 py-1"
																>
																	{val === null ||
																	val === undefined ||
																	val === "" ||
																	val === false ||
																	val === "false" ? (
																		<span className="text-gray-400">-</span>
																	) : val === true || val === "true" ? (
																		ctx.t({
																			code: "common.yes",
																			msg: "Yes",
																		})
																	) : (
																		String(val)
																	)}
																</td>
															))}
														</tr>
													))}
												</tbody>
											</table>
										</div>
									</div>
								))}
						</div>
					)}
				</div>
			</Card>

			{/* Card 5: Sector effects */}
			{renderSectionCard(
				ctx.t({ code: "sector_effects", msg: "Sector effects" }),
				"pi pi-building text-blue-600",
				ctx.t({
					code: "disaster_record.no_sector_effects",
					msg: "No sector effects recorded yet",
				}),
				<div className="space-y-4">
					{Array.isArray(recordsDisRecSectors) &&
						recordsDisRecSectors.map((sectorItem, idx) => (
							<Fragment key={sectorItem.catId ?? idx}>
								<SectorEffectsTable
									item={sectorItem}
									disasterRecord={item.disasterRecord || []}
									ctx={ctx}
								/>
							</Fragment>
						))}
				</div>,
				recordsDisRecSectors.length > 0,
			)}

			{/* Card 6: Non-economic losses */}
			{renderSectionCard(
				ctx.t({
					code: "non_economic_losses",
					msg: "Non-economic losses",
				}),
				"pi pi-wallet text-blue-600",
				ctx.t({
					code: "disaster_record.no_noneco_losses",
					msg: "No non-economic losses recorded yet",
				}),
				<div className="overflow-x-auto">
					<table className="w-full border border-gray-300 text-sm">
						<thead className="bg-gray-50 text-gray-700">
							<tr>
								{[
									{ code: "common.category", msg: "Category" },
									{ code: "common.description", msg: "Description" },
								].map(({ code, msg }) => (
									<th
										key={code}
										className="border border-gray-300 px-3 py-2 text-left font-medium"
									>
										{ctx.t({ code, msg })}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{Array.isArray(recordsNonecoLosses) &&
								recordsNonecoLosses.map((nonecoItem, idx) => (
									<tr key={idx} className="hover:bg-gray-50">
										<td className="border border-gray-300 px-3 py-2 font-medium text-slate-700">
											{nonecoItem.categoryTreeDisplay}
										</td>
										<td className="border border-gray-300 px-3 py-2 text-slate-600 whitespace-pre-line">
											{renderMultilineText(nonecoItem.noneccoDesc)}
										</td>
									</tr>
								))}
						</tbody>
					</table>
				</div>,
				recordsNonecoLosses.length > 0,
			)}

			{/* Card 7: Attachments */}
			{renderSectionCard(
				ctx.t({ code: "common.attachments", msg: "Attachments" }),
				"pi pi-paperclip text-blue-600",
				ctx.t({
					code: "disaster_event.review.no_attachments_selected",
					msg: "No attachments selected",
				}),
				attachmentsList.length > 0 ? (
					<div className="overflow-x-auto">
						<table className="w-full border border-gray-300 text-sm">
							<thead className="bg-gray-50 text-gray-700">
								<tr>
									<th className="border border-gray-300 px-3 py-2 text-left font-medium">
										{ctx.t({ code: "common.title", msg: "Title" })}
									</th>
									<th className="border border-gray-300 px-3 py-2 text-left font-medium">
										{ctx.t({ code: "common.tags", msg: "Tags" })}
									</th>
									<th className="border border-gray-300 px-3 py-2 text-left font-medium">
										{ctx.t({
											code: "attachments.file_or_url",
											msg: "File/URL",
										})}
									</th>
								</tr>
							</thead>
							<tbody>
								{attachmentsList.map((att) => (
									<tr key={att.id} className="hover:bg-gray-50">
										<td className="border border-gray-300 px-3 py-2 font-medium text-slate-800">
											{att.title || att.fileName || "-"}
										</td>
										<td className="border border-gray-300 px-3 py-2 text-slate-600">
											{att.tags && att.tags.length > 0 ? (
												<div className="flex flex-wrap gap-1.5">
													{att.tags.map((tag, tIdx) => (
														<span
															key={tIdx}
															className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
														>
															{tag}
														</span>
													))}
												</div>
											) : (
												<span className="text-gray-400">-</span>
											)}
										</td>
										<td className="border border-gray-300 px-3 py-2 text-slate-700">
											{att.isLink ? (
												<a
													href={att.linkUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
												>
													<span>{att.displayUrl}</span>
													<i className="pi pi-external-link text-xs text-blue-500" />
												</a>
											) : att.fileName ? (
												<a
													href={att.href}
													target="_blank"
													rel="noopener noreferrer"
													className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
													title={att.fileName}
												>
													<i
														className={`${getFileIconClass(att.fileName)} text-slate-500`}
													/>
													<span>{att.fileName}</span>
													{att.fileSize > 0 && (
														<span className="text-xs text-slate-400">
															({formatFileSize(att.fileSize)})
														</span>
													)}
												</a>
											) : (
												<span className="text-gray-400">-</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="text-[14px] italic text-slate-400">
						{ctx.t({
							code: "disaster_event.review.no_attachments_selected",
							msg: "No attachments selected",
						})}
					</p>
				),
				attachmentsList.length > 0,
			)}

			{/* Card 8: Audit log history (when present) */}
			{auditLogs && auditLogs.length > 0 ? (
				<Card
					className="rounded-2xl border border-slate-200 shadow-none"
					pt={{ body: { style: { padding: "18px 20px" } } }}
				>
					<div className="space-y-4">
						<div className="flex items-center gap-2 text-slate-800">
							<i className="pi pi-history text-blue-600" />
							<h4 className="text-[18px] leading-[24px] font-semibold">
								{ctx.t({
									code: "audit_log.history",
									msg: "Audit log history",
								})}
							</h4>
						</div>
						<AuditLogHistory ctx={ctx} auditLogs={auditLogs} />
					</div>
				</Card>
			) : null}
		</div>
	);
}
