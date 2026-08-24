import { useEffect, useMemo, useRef } from "react";
import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { DataView } from "primereact/dataview";
import LinkedHazardousEventCard from "~/frontend/disaster-event/LinkedHazardousEventCard";
import LinkedDisasterRecordCard from "~/frontend/disaster-event/LinkedDisasterRecordCard";
import { ViewContext } from "~/frontend/context";

type LinkedEventOption = {
	id: string;
	name: string;
	code: string;
	hip?: string;
	dateLabel?: string;
	divisionNamesLabel?: string;
};

type SelectedDivisionItem = {
	key: string;
	label: string;
};

type AdditionalDetailMeta = {
	declarationStatusId?: string;
	declarationStatus?: string;
	issuingOrganization?: string;
	assessmentTypeId?: string;
	otherSectors?: string;
	sectorIds?: string[];
};

type ResponseAttachmentValue = {
	id?: string;
	title?: string;
	fileKey?: string;
	fileName: string;
	fileType: string;
	fileSize: number;
	tempFilePath?: string;
	tenantPath?: string;
};

type AdditionalDetailItem = {
	id: string;
	type: string;
	date: string;
	coverage?: string;
	description: string;
	meta?: AdditionalDetailMeta;
	attachmentCount?: number;
	attachments?: ResponseAttachmentValue[];
};

type ReviewAttachmentItem = {
	id: string;
	fileName: string;
	fileKey?: string;
	href?: string;
	fileType?: string;
	fileSize?: number;
};

type ReviewLinkItem = {
	id: string;
	url: string;
	title: string;
};

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

function renderMultilineText(value: string, keyPrefix: string) {
	return value.split(/\r?\n/).map((line, index, lines) => (
		<span key={`${keyPrefix}-line-${index}`}>
			{line}
			{index < lines.length - 1 ? <br /> : null}
		</span>
	));
}

type DisasterEventReviewStepProps = {
	ctx: ViewContext;
	form: {
		nameNational: string;
		nameGlobalOrRegional: string;
		nationalDisasterId: string;
		glide: string;
		id: string;
		recordingOrganizationName: string;
	};
	selectedHazardTypeName: string;
	selectedHazardClusterName: string;
	selectedSpecificHazardName: string;
	startTimingValue: string;
	endTimingValue: string;
	selectedDivisionItems: SelectedDivisionItem[];
	reviewSpatialFootprintItems: string[];
	reviewSpatialFootprintData: any[];
	reviewLinks: ReviewLinkItem[];
	reviewAttachments: ReviewAttachmentItem[];
	triggeringHazardousEventTarget: LinkedEventOption[];
	triggeredHazardousEventTarget: LinkedEventOption[];
	triggeringDisasterEventTarget: LinkedEventOption[];
	triggeredDisasterEventTarget: LinkedEventOption[];
	linkedDisasterRecordTarget: LinkedEventOption[];
	responses: AdditionalDetailItem[];
	assessments: AdditionalDetailItem[];
	declarations: AdditionalDetailItem[];
	sectorNameById?: Map<string, string>;
	getDetailTypeLabel: (value: string) => string;
	getDetailDescriptionValue: (item: AdditionalDetailItem) => string;
	showHeader?: boolean;
	showActions?: boolean;
	onCancel: () => void;
	onBack: () => void;
	onSendForValidation: () => void;
};

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
					weight: 2.2,
					fillOpacity: 0.36,
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

			L.tileLayer(
				"https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
				{
					attribution: "",
				},
			).addTo(map);

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
				className="h-[360px] w-full overflow-hidden rounded-lg border border-slate-200"
			/>
		</div>
	);
}

const renderReviewItem = (label: string, value: string) => (
	<div className="space-y-1">
		<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
			{label}
		</p>
		<p className="text-[14px] leading-[14px] font-semibold text-slate-800">
			{value || "-"}
		</p>
	</div>
);

const renderStep4SectionCard = (
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

const renderStep4DetailRow = (
	ctx: ViewContext,
	category: "response" | "assessment" | "declaration",
	item: AdditionalDetailItem,
	getDetailTypeLabel: (value: string) => string,
	getDetailDescriptionValue: (item: AdditionalDetailItem) => string,
	sectorNameById?: Map<string, string>,
) => {
	const badgeClass =
		category === "response"
			? "bg-blue-100 text-blue-700"
			: category === "assessment"
				? "bg-violet-100 text-violet-700"
				: "bg-amber-100 text-amber-700";
	const typeLabel = getDetailTypeLabel(item.type);
	const descriptionValue = getDetailDescriptionValue(item);
	const assessmentSectorNames =
		category === "assessment"
			? (item.meta?.sectorIds ?? [])
					.map((sectorId) => sectorNameById?.get(sectorId) ?? sectorId)
					.filter(Boolean)
			: [];

	return (
		<div key={item.id} className="space-y-2">
			<div className="flex items-center gap-3">
				<span
					className={`rounded-full px-2 py-1 text-[11px] font-semibold ${badgeClass}`}
				>
					{typeLabel}
				</span>
				{item.date ? (
					<span className="text-[12px] text-slate-500">{item.date}</span>
				) : null}
			</div>
			{category === "response" ||
			category === "declaration" ||
			category === "assessment" ? (
				<div className="space-y-1 text-[14px] text-slate-500">
					{category === "declaration" && item.meta?.declarationStatus ? (
						<p>
							<span className="font-semibold text-slate-700">
								{ctx.t({ code: "common.status", msg: "Status" })}:
							</span>{" "}
							{item.meta.declarationStatus}
						</p>
					) : null}
					{category === "declaration" &&
					item.meta?.issuingOrganization?.trim() ? (
						<p>
							<span className="font-semibold text-slate-700">
								{ctx.t({
									code: "disaster_event.review.issuing_organization",
									msg: "Issuing organization",
								})}
								:
							</span>{" "}
							{item.meta.issuingOrganization.trim()}
						</p>
					) : null}
					{item.coverage?.trim() ? (
						<p>
							<span className="font-semibold text-slate-700">
								{ctx.t({
									code: "disaster_event.review.coverage",
									msg: "Coverage",
								})}
								:
							</span>{" "}
							{item.coverage.trim()}
						</p>
					) : null}
					{item.description?.trim() ? (
						<p>
							<span className="font-semibold text-slate-700">
								{category === "declaration"
									? `${ctx.t({ code: "disaster_event.effects", msg: "Effects" })}:`
									: `${ctx.t({ code: "common.description", msg: "Description" })}:`}
							</span>{" "}
							{renderMultilineText(
								item.description.trim(),
								`${item.id}-detail-description`,
							)}
						</p>
					) : null}
					{category === "assessment" && assessmentSectorNames.length > 0 ? (
						<p>
							<span className="font-semibold text-slate-700">
								{ctx.t({ code: "common.sectors", msg: "Sectors" })}:
							</span>{" "}
							{assessmentSectorNames.join(", ")}
						</p>
					) : null}
					{category === "assessment" && item.meta?.otherSectors?.trim() ? (
						<p>
							<span className="font-semibold text-slate-700">
								{ctx.t({
									code: "disaster_event.review.other_sectors",
									msg: "Other sectors",
								})}
								:
							</span>{" "}
							{item.meta.otherSectors.trim()}
						</p>
					) : null}
					{!item.coverage?.trim() &&
					(item.meta?.sectorIds ?? []).length === 0 &&
					!(item.meta?.otherSectors ?? "").trim() &&
					!item.description?.trim() ? (
						<p>-</p>
					) : null}
				</div>
			) : descriptionValue ? (
				<p className="text-[14px] text-slate-500">
					{descriptionValue.split(/\r?\n/).map((line, index, lines) => (
						<span key={`${item.id}-review-line-${index}`}>
							{line}
							{index < lines.length - 1 ? <br /> : null}
						</span>
					))}
				</p>
			) : null}
			{category === "response" ||
			category === "declaration" ||
			category === "assessment" ? (
				<div className="space-y-2">
					{item.attachments && item.attachments.length > 0 ? (
						<div className="space-y-2">
							<p className="text-[14px] font-semibold text-slate-700">
								{ctx.t({ code: "common.attachments", msg: "Attachments" })}:
							</p>
							{item.attachments.map((attachment, index) => {
								const href = (attachment as { href?: string }).href;
								return (
									<div
										key={
											attachment.id ??
											attachment.fileKey ??
											`${item.id}-attachment-${index}`
										}
										className="rounded-md border border-slate-200 bg-white px-3 py-2"
									>
										<div className="flex items-center justify-between gap-3">
											<div className="flex min-w-0 items-center gap-3">
												<i
													className={`${getFileIconClass(attachment.fileName)} text-slate-500`}
												/>
												<div className="min-w-0">
													{href ? (
														<a
															href={href}
															target="_blank"
															rel="noopener noreferrer"
															className="truncate text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
															title={attachment.fileName}
														>
															{attachment.fileName}
														</a>
													) : (
														<p className="truncate text-sm font-medium text-slate-800">
															{attachment.fileName}
														</p>
													)}
													<p className="text-xs text-slate-500">
														{`${formatFileSize(attachment.fileSize ?? 0)}${
															attachment.fileType
																? ` • ${attachment.fileType}`
																: ""
														}`}
													</p>
												</div>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
};

const linkedEventItemTemplate = (
	item: LinkedEventOption,
	layout?: "list" | "grid",
) => {
	const wrapperClass =
		layout === "grid"
			? "linked-disaster-record-grid-item mb-2 last:mb-0"
			: "w-full mb-2 last:mb-0";

	return (
		<div className={wrapperClass}>
			<LinkedDisasterRecordCard item={item} />
		</div>
	);
};

const linkedHazardousEventItemTemplate = (
	item: LinkedEventOption,
	layout?: "list" | "grid",
) => {
	const wrapperClass =
		layout === "grid"
			? "linked-disaster-record-grid-item mb-2 last:mb-0"
			: "w-full mb-2 last:mb-0";

	return (
		<div className={wrapperClass}>
			<LinkedHazardousEventCard item={item} />
		</div>
	);
};

export default function DisasterEventReviewStep({
	ctx,
	form,
	selectedHazardTypeName,
	selectedHazardClusterName,
	selectedSpecificHazardName,
	startTimingValue,
	endTimingValue,
	selectedDivisionItems,
	reviewSpatialFootprintItems,
	reviewSpatialFootprintData,
	reviewLinks,
	reviewAttachments,
	triggeringHazardousEventTarget,
	triggeredHazardousEventTarget,
	triggeringDisasterEventTarget,
	triggeredDisasterEventTarget,
	linkedDisasterRecordTarget,
	responses,
	assessments,
	declarations,
	sectorNameById,
	getDetailTypeLabel,
	getDetailDescriptionValue,
	showHeader = true,
	showActions = true,
	onCancel,
	onBack,
	onSendForValidation,
}: DisasterEventReviewStepProps) {
	return (
		<>
			<style>{`
				.linked-disaster-records-grid .p-dataview-content .p-grid {
					display: grid;
					grid-template-columns: repeat(1, minmax(0, 1fr));
					gap: 0.75rem;
					margin: 0;
				}

				@media (min-width: 768px) {
					.linked-disaster-records-grid .p-dataview-content .p-grid {
						grid-template-columns: repeat(2, minmax(0, 1fr));
					}
				}

				@media (min-width: 1280px) {
					.linked-disaster-records-grid .p-dataview-content .p-grid {
						grid-template-columns: repeat(3, minmax(0, 1fr));
					}
				}

				.linked-disaster-record-grid-item {
					min-width: 0;
				}
			`}</style>
			<div className="space-y-5">
				{showHeader ? (
					<div>
						<h3 className="text-[18px] leading-[24px] font-semibold text-slate-800">
							{ctx.t({
								code: "disaster_event.review.review_and_save",
								msg: "Review and save",
							})}
						</h3>
						<p className="mt-1 text-[14px] leading-[22px] text-slate-500">
							{ctx.t({
								code: "disaster_event.review.verify_before_saving",
								msg: "Verify the information before saving.",
							})}
						</p>
					</div>
				) : null}

				<Card
					className="rounded-2xl border border-slate-200 shadow-none"
					pt={{ body: { style: { padding: "5px 20px 5px 20px" } } }}
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
									code: "disaster_event.national_name",
									msg: "National name",
								}),
								form.nameNational,
							)}
							{renderReviewItem(
								ctx.t({
									code: "disaster_event.global_regional_name",
									msg: "Global/regional name",
								}),
								form.nameGlobalOrRegional,
							)}
							{renderReviewItem(
								ctx.t({
									code: "disaster_event.national_disaster_id",
									msg: "National disaster ID",
								}),
								form.nationalDisasterId,
							)}
							{renderReviewItem(
								ctx.t({ code: "disaster_event.glide_number", msg: "GLIDE number" }),
								form.glide,
							)}
							{renderReviewItem(
								ctx.t({ code: "disaster_event.uuid", msg: "Disaster event UUID" }),
								form.id,
							)}
							{renderReviewItem(
								ctx.t({
									code: "disaster_event.recording_organization",
									msg: "Recording organization",
								}),
								form.recordingOrganizationName,
							)}
						</div>
					</div>
				</Card>

				<Card
					className="rounded-2xl border border-slate-200 shadow-none"
					pt={{ body: { style: { padding: "5px 20px 5px 20px" } } }}
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
								selectedHazardTypeName,
							)}
							{renderReviewItem(
								ctx.t({ code: "hip.hazard_cluster", msg: "Hazard cluster" }),
								selectedHazardClusterName,
							)}
							{renderReviewItem(
								ctx.t({ code: "hip.specific_hazard", msg: "Specific hazard" }),
								selectedSpecificHazardName,
							)}
						</div>
						<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
							{renderReviewItem(
								ctx.t({ code: "analysis.start", msg: "Start" }),
								startTimingValue,
							)}
							{renderReviewItem(
								ctx.t({ code: "analysis.end", msg: "End" }),
								endTimingValue,
							)}
						</div>
					</div>
				</Card>

				{renderStep4SectionCard(
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
							{selectedDivisionItems.length > 0 ? (
								<div className="flex flex-wrap gap-2">
									{selectedDivisionItems.map((item) => (
										<span
											key={`review-division-${item.key}`}
											className="rounded-md bg-blue-50 px-2 py-1 text-[12px] text-blue-700"
										>
											{item.label}
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
							{reviewSpatialFootprintItems.length > 0 ? (
								<ul className="list-disc pl-5 text-[14px] text-slate-500">
									{reviewSpatialFootprintItems.map((title, index) => (
										<li key={`review-footprint-${index}`}>{title}</li>
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
							spatialFootprintData={reviewSpatialFootprintData}
						/>
					</>,
					selectedDivisionItems.length > 0 ||
						reviewSpatialFootprintItems.length > 0,
				)}

				{renderStep4SectionCard(
					ctx.t({ code: "disaster_event.review.links", msg: "Links" }),
					"pi pi-link text-blue-600",
					ctx.t({
						code: "disaster_event.review.no_links_selected",
						msg: "No links selected",
					}),
					reviewLinks.length > 0 ? (
						<div className="space-y-3">
							{reviewLinks.map((link) => (
								<div
									key={link.id}
									className="rounded-md border border-slate-200 bg-white px-3 py-2"
								>
									<div className="flex items-center justify-between gap-3">
										<div className="min-w-0">
											<a
												href={link.url}
												target="_blank"
												rel="noopener noreferrer"
												className="truncate text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
												title={link.title || link.url}
											>
												{link.title || link.url}
											</a>
											<p className="text-xs text-slate-500">{link.url}</p>
										</div>
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-[14px] italic text-slate-400">
							{ctx.t({
								code: "disaster_event.review.no_links_selected",
								msg: "No links selected",
							})}
						</p>
					),
					true,
				)}

				{renderStep4SectionCard(
					ctx.t({ code: "common.attachments", msg: "Attachments" }),
					"pi pi-paperclip text-blue-600",
					ctx.t({
						code: "disaster_event.review.no_attachments_selected",
						msg: "No attachments selected",
					}),
					reviewAttachments.length > 0 ? (
						<div className="space-y-3">
							{reviewAttachments.map((attachment) => (
								<div
									key={attachment.id}
									className="rounded-md border border-slate-200 bg-white px-3 py-2"
								>
									<div className="flex items-center justify-between gap-3">
										<div className="flex min-w-0 items-center gap-3">
											<i
												className={`${getFileIconClass(attachment.fileName)} text-slate-500`}
											/>
											<div className="min-w-0">
												{attachment.href ? (
													<a
														href={attachment.href}
														target="_blank"
														rel="noopener noreferrer"
														className="truncate text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
														title={attachment.fileName}
													>
														{attachment.fileName}
													</a>
												) : (
													<p className="truncate text-sm font-medium text-slate-800">
														{attachment.fileName}
													</p>
												)}
												<p className="text-xs text-slate-500">
													{`${formatFileSize(attachment.fileSize ?? 0)}${
														attachment.fileType
															? ` • ${attachment.fileType}`
															: ""
													}`}
												</p>
											</div>
										</div>
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-[14px] italic text-slate-400">
							{ctx.t({
								code: "disaster_event.review.no_attachments_selected",
								msg: "No attachments selected",
							})}
						</p>
					),
					true,
				)}

				{renderStep4SectionCard(
					ctx.t({
						code: "disaster_event.review.linked_events",
						msg: "Linked events",
					}),
					"pi pi-link text-blue-600",
					ctx.t({
						code: "disaster_event.review.no_linked_events",
						msg: "No linked hazardous or disaster events selected yet",
					}),
					<>
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div className="rounded-xl border border-slate-200 bg-white p-4">
								<div className="space-y-3">
									<p className="text-[14px] font-semibold text-slate-700">
										{ctx.t({
											code: "disaster_event.review.triggering_hazardous_events",
											msg: "Triggering (causal) hazardous events",
										})}
									</p>
									<DataView
										className="linked-disaster-event-grid"
										value={triggeringHazardousEventTarget}
										itemTemplate={linkedHazardousEventItemTemplate}
										emptyMessage={ctx.t({
											code: "disaster_event.review.no_triggering_hazardous_events",
											msg: "No linked triggering (causal) hazardous events",
										})}
										layout="grid"
									/>
								</div>
							</div>
							<div className="rounded-xl border border-slate-200 bg-white p-4">
								<div className="space-y-3">
									<p className="text-[14px] font-semibold text-slate-700">
										{ctx.t({
											code: "disaster_event.review.triggered_hazardous_events",
											msg: "Triggered (subsequent) hazardous events",
										})}
									</p>
									<DataView
										className="linked-disaster-event-grid"
										value={triggeredHazardousEventTarget}
										itemTemplate={linkedHazardousEventItemTemplate}
										emptyMessage={ctx.t({
											code: "disaster_event.review.no_triggered_hazardous_events",
											msg: "No linked triggered (subsequent) hazardous events",
										})}
										layout="grid"
									/>
								</div>
							</div>
						</div>
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div className="rounded-xl border border-slate-200 bg-white p-4">
								<div className="space-y-3">
									<p className="text-[14px] font-semibold text-slate-700">
										{ctx.t({
											code: "disaster_event.review.triggering_disaster_events",
											msg: "Triggering (causal) disaster events",
										})}
									</p>
									<DataView
										className="linked-disaster-event-grid"
										value={triggeringDisasterEventTarget}
										itemTemplate={linkedEventItemTemplate}
										emptyMessage={ctx.t({
											code: "disaster_event.review.no_triggering_disaster_events",
											msg: "No linked triggering (causal) disaster events",
										})}
										layout="grid"
									/>
								</div>
							</div>
							<div className="rounded-xl border border-slate-200 bg-white p-4">
								<div className="space-y-3">
									<p className="text-[14px] font-semibold text-slate-700">
										{ctx.t({
											code: "disaster_event.review.triggered_disaster_events",
											msg: "Triggered (subsequent) disaster events",
										})}
									</p>
									<DataView
										className="linked-disaster-event-grid"
										value={triggeredDisasterEventTarget}
										itemTemplate={linkedEventItemTemplate}
										emptyMessage={ctx.t({
											code: "disaster_event.review.no_triggered_disaster_events",
											msg: "No linked triggered (subsequent) disaster events",
										})}
										layout="grid"
									/>
								</div>
							</div>
						</div>
					</>,
					triggeringHazardousEventTarget.length > 0 ||
						triggeredHazardousEventTarget.length > 0 ||
						triggeringDisasterEventTarget.length > 0 ||
						triggeredDisasterEventTarget.length > 0,
				)}

				{renderStep4SectionCard(
					ctx.t({
						code: "disaster_event.review.linked_disaster_records",
						msg: "Linked disaster records",
					}),
					"pi pi-file text-blue-600",
					ctx.t({
						code: "disaster_event.review.no_linked_disaster_records",
						msg: "No disaster records linked yet",
					}),
					<DataView
						className="linked-disaster-records-grid"
						value={linkedDisasterRecordTarget}
						itemTemplate={linkedEventItemTemplate}
						layout="grid"
					/>,
					linkedDisasterRecordTarget.length > 0,
				)}

				{renderStep4SectionCard(
					ctx.t({
						code: "disaster_event.review.responses",
						msg: "Responses",
					}),
					"pi pi-file-edit text-blue-600",
					ctx.t({
						code: "disaster_event.review.no_responses",
						msg: "No responses recorded yet",
					}),
					responses.map((item) =>
						renderStep4DetailRow(
							ctx,
							"response",
							item,
							getDetailTypeLabel,
							getDetailDescriptionValue,
							sectorNameById,
						),
					),
					responses.length > 0,
				)}

				{renderStep4SectionCard(
					ctx.t({
						code: "disaster_event.review.assessments",
						msg: "Assessments",
					}),
					"pi pi-clipboard text-violet-600",
					ctx.t({
						code: "disaster_event.review.no_assessments",
						msg: "No assessments recorded yet",
					}),
					assessments.map((item) =>
						renderStep4DetailRow(
							ctx,
							"assessment",
							item,
							getDetailTypeLabel,
							getDetailDescriptionValue,
							sectorNameById,
						),
					),
					assessments.length > 0,
				)}

				{renderStep4SectionCard(
					ctx.t({
						code: "disaster_event.review.official_declarations",
						msg: "Official declarations",
					}),
					"pi pi-send text-amber-600",
					ctx.t({
						code: "disaster_event.review.no_declarations",
						msg: "No declarations recorded yet",
					}),
					declarations.map((item) =>
						renderStep4DetailRow(
							ctx,
							"declaration",
							item,
							getDetailTypeLabel,
							getDetailDescriptionValue,
							sectorNameById,
						),
					),
					declarations.length > 0,
				)}
			</div>

			{showActions ? (
				<>
					<div className="col-span-12 mt-30 mb-6 h-[2px] w-full bg-slate-200" />

					<div className="flex items-center justify-between w-full">
						<Button
							type="button"
							label={ctx.t({ code: "common.cancel", msg: "Cancel" })}
							outlined
							onClick={onCancel}
						/>
						<div className="flex gap-2">
							<Button
								type="button"
								label={ctx.t({ code: "common.back", msg: "Back" })}
								outlined
								icon="pi pi-chevron-left"
								iconPos="left"
								onClick={onBack}
							/>
							<Button
								type="button"
								label={ctx.t({
									code: "common.submit_for_validation",
									msg: "Submit for validation",
								})}
								icon="pi pi-send"
								iconPos="right"
								onClick={onSendForValidation}
							/>
						</div>
					</div>
				</>
			) : null}
		</>
	);
}
