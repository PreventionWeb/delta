import { useEffect, useMemo, useRef } from "react";
import { Card } from "primereact/card";
import { ViewContext } from "~/frontend/context";
import { formatDate } from "~/utils/date";
import { LangLink } from "~/utils/link";
import AuditLogHistory from "~/components/AuditLogHistory";
import { parseAttachments } from "~/frontend/disaster-record/DisasterRecordReviewStep";

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

export interface HazardousEventReviewStepProps {
	ctx: ViewContext;
	item: {
		id: string;
		status?: string;
		nationalSpecification?: string | null;
		startDate?: string | null;
		endDate?: string | null;
		description?: string | null;
		chainsExplanation?: string | null;
		magnitude?: string | null;
		recordOriginator?: string | null;
		hazardousEventStatus?: "forecasted" | "ongoing" | "passed" | null;
		dataSource?: string | null;
		createdAt?: string | Date | null;
		updatedAt?: string | Date | null;
		specificHazardLocalName?: string | null;
		specificHazardNationalName?: string | null;
		hipHazard?: {
			code?: string | null;
			name?: Record<string, string> | string | null;
		} | null;
		hipCluster?: {
			name?: Record<string, string> | string | null;
		} | null;
		hipType?: {
			name?: Record<string, string> | string | null;
		} | null;
		spatialFootprint?: any[];
		attachments?: unknown;
		parent?: any | null;
		children?: any[];
	};
	auditLogs?: any[];
}

export default function HazardousEventReviewStep({
	ctx,
	item,
	auditLogs,
}: HazardousEventReviewStepProps) {
	const lang = ctx.lang || "en";

	const formatReviewDate = (val: unknown): string => {
		if (!val) return "-";
		const formatted = formatDate(val as any);
		return formatted || "-";
	};

	// Status badge mapping
	const statusBadge = () => {
		const st = item.hazardousEventStatus;
		if (!st) return "-";
		const label =
			st === "forecasted"
				? ctx.t({
						code: "hazardous_event.status.forecasted",
						msg: "Forecasted",
					})
				: st === "ongoing"
					? ctx.t({ code: "hazardous_event.status.ongoing", msg: "Ongoing" })
					: st === "passed"
						? ctx.t({ code: "hazardous_event.status.passed", msg: "Passed" })
						: st;

		const badgeClass =
			st === "ongoing"
				? "bg-amber-100 text-amber-800"
				: st === "passed"
					? "bg-emerald-100 text-emerald-800"
					: "bg-blue-100 text-blue-800";

		return (
			<span
				className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}
			>
				{label}
			</span>
		);
	};

	// Taxonomy names
	const hazardTypeName = localizedText(item.hipType?.name, lang);
	const hazardClusterName = localizedText(item.hipCluster?.name, lang);
	const specificHazardBaseName = localizedText(item.hipHazard?.name, lang);
	const specificHazardCode = item.hipHazard?.code;
	const specificHazardDisplay = [
		specificHazardBaseName,
		specificHazardCode ? `(${specificHazardCode})` : "",
		item.specificHazardNationalName
			? `[${item.specificHazardNationalName}]`
			: "",
	]
		.filter(Boolean)
		.join(" ");

	// Geographic divisions and footprints
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
		return parseAttachments(item.attachments, item.id, ctx, "event");
	}, [item.attachments, item.id, ctx]);

	// Linked events (Parent / Child)
	const parentItem = item.parent;
	const childrenItems = Array.isArray(item.children) ? item.children : [];
	const hasLinkedEvents = Boolean(parentItem || childrenItems.length > 0);

	const renderLinkedCard = (ev: any) => {
		if (!ev) return null;
		const evId = ev.id || "";
		const evDesc = ev.description || "";
		const evHazard = localizedText(ev.hipHazard?.name, lang);
		const evCode = ev.hipHazard?.code;
		const title =
			evHazard || evDesc || `Hazardous Event: ${evId.substring(0, 8)}`;
		const subtitle = [
			evCode ? `HIP: ${evCode}` : "",
			evDesc && evHazard ? evDesc : "",
			evId ? `UUID: ${evId.substring(0, 8)}` : "",
		]
			.filter(Boolean)
			.join(" • ");

		return (
			<div
				key={evId}
				className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-none"
			>
				<div>
					<LangLink
						lang={ctx.lang}
						to={`/hazardous-event/${evId}`}
						className="text-[14px] font-semibold text-blue-700 hover:text-blue-800 hover:underline"
					>
						{title}
					</LangLink>
					{subtitle ? (
						<p className="mt-1 text-xs text-slate-500">{subtitle}</p>
					) : null}
				</div>
			</div>
		);
	};

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
								code: "hazardous_event.record_originator",
								msg: "Record originator",
							}),
							item.recordOriginator || "-",
						)}
						<div className="space-y-1">
							<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
								{ctx.t({
									code: "hazardous_event.status",
									msg: "Hazardous event Status",
								})}
							</p>
							<div className="pt-0.5">{statusBadge()}</div>
						</div>
						{renderReviewItem(
							ctx.t({
								code: "hazardous_event.magnitude",
								msg: "Magnitude",
							}),
							item.magnitude || "-",
						)}
						{renderReviewItem(
							ctx.t({
								code: "hazardous_event.data_source",
								msg: "Data source",
							}),
							item.dataSource || "-",
						)}
						{renderReviewItem(
							ctx.t({
								code: "common.uuid",
								msg: "UUID",
							}),
							item.id || "-",
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
					{item.nationalSpecification ? (
						<div className="space-y-1">
							<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
								{ctx.t({
									code: "hazardous_event.national_specification",
									msg: "National specification",
								})}
							</p>
							<p className="text-[14px] leading-relaxed text-slate-700 whitespace-pre-line">
								{item.nationalSpecification}
							</p>
						</div>
					) : null}
					{item.description ? (
						<div className="space-y-1">
							<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
								{ctx.t({
									code: "common.description",
									msg: "Description",
								})}
							</p>
							<p className="text-[14px] leading-relaxed text-slate-700 whitespace-pre-line">
								{item.description}
							</p>
						</div>
					) : null}
					{item.chainsExplanation ? (
						<div className="space-y-1">
							<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
								{ctx.t({
									code: "hazardous_event.chains_explanation",
									msg: "Composite event - chains explanation",
								})}
							</p>
							<p className="text-[14px] leading-relaxed text-slate-700 whitespace-pre-line">
								{item.chainsExplanation}
							</p>
						</div>
					) : null}
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

					<div className="space-y-2">
						<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
							{ctx.t({
								code: "common.spatial_footprint",
								msg: "Spatial footprint",
							})}
						</p>
						{footprintItems.length > 0 ? (
							<ul className="list-disc pl-5 text-[14px] text-slate-600 space-y-1">
								{footprintItems.map((title, idx) => (
									<li key={`fp-${idx}`}>{title}</li>
								))}
							</ul>
						) : (
							<p className="text-[14px] italic text-slate-400">
								{ctx.t({
									code: "disaster_event.review.no_spatial_data",
									msg: "No spatial data defined",
								})}
							</p>
						)}
					</div>

					<ReviewLocationMap
						ctx={ctx}
						spatialFootprintData={item.spatialFootprint || []}
					/>
				</>,
				divisionPills.length > 0 || footprintItems.length > 0,
			)}

			{/* Card 4: Attachments */}
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

			{/* Card 5: Linked events */}
			{renderSectionCard(
				ctx.t({
					code: "disaster_event.review.linked_events",
					msg: "Linked events",
				}),
				"pi pi-link text-blue-600",
				ctx.t({
					code: "disaster_event.review.no_linked_events",
					msg: "No linked events",
				}),
				<div className="space-y-4">
					{/* Parent event */}
					<div className="space-y-2">
						<p className="text-[13px] font-semibold text-slate-700">
							{ctx.t({
								code: "hazardous_event.caused_by",
								msg: "Caused by",
							})}
						</p>
						{parentItem ? (
							renderLinkedCard(parentItem)
						) : (
							<p className="text-[13px] italic text-slate-400">
								{ctx.t({
									code: "common.none",
									msg: "None",
								})}
							</p>
						)}
					</div>

					{/* Children events */}
					<div className="space-y-2">
						<p className="text-[13px] font-semibold text-slate-700">
							{ctx.t({
								code: "hazardous_event.causing",
								msg: "Causing",
							})}
						</p>
						{childrenItems.length > 0 ? (
							<div className="space-y-2">
								{childrenItems.map((ch) => renderLinkedCard(ch))}
							</div>
						) : (
							<p className="text-[13px] italic text-slate-400">
								{ctx.t({
									code: "common.none",
									msg: "None",
								})}
							</p>
						)}
					</div>
				</div>,
				hasLinkedEvents,
			)}

			{/* Card 6: Audit log history (when present) */}
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
