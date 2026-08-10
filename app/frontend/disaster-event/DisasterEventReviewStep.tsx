import { useEffect, useMemo, useRef } from "react";
import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { DataView } from "primereact/dataview";

type LinkedEventOption = {
	id: string;
	name: string;
	code: string;
	hip?: string;
};

type SelectedDivisionItem = {
	key: string;
	label: string;
};

type AdditionalDetailMeta = {
	declarationStatus?: "unknown" | "yes" | "no";
	hadOfficialWarningOrWeatherAdvisory?: boolean;
	officialWarningAffectedAreas?: string;
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
	spatialFootprintData,
}: {
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
				Map
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
	category: "response" | "assessment" | "declaration",
	item: AdditionalDetailItem,
	getDetailTypeLabel: (value: string) => string,
	getDetailDescriptionValue: (item: AdditionalDetailItem) => string,
) => {
	const badgeClass =
		category === "response"
			? "bg-blue-100 text-blue-700"
			: category === "assessment"
				? "bg-violet-100 text-violet-700"
				: "bg-amber-100 text-amber-700";
	const typeLabel = getDetailTypeLabel(item.type);
	const descriptionValue = getDetailDescriptionValue(item);

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
			{category === "response" ? (
				<div className="space-y-1 text-[14px] text-slate-500">
					{item.coverage?.trim() ? (
						<p>
							<span className="font-semibold text-slate-700">Coverage:</span>{" "}
							{item.coverage.trim()}
						</p>
					) : null}
					{item.description?.trim() ? (
						<p>
							<span className="font-semibold text-slate-700">Description:</span>{" "}
							{renderMultilineText(
								item.description.trim(),
								`${item.id}-response-description`,
							)}
						</p>
					) : null}
					{!item.coverage?.trim() && !item.description?.trim() ? (
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
			{category === "response" ? (
				<div className="space-y-2">
					{item.attachments && item.attachments.length > 0 ? (
						<div className="space-y-2">
							<p className="text-[14px] font-semibold text-slate-700">
								Attachments:
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
		layout === "grid" ? "linked-disaster-record-grid-item" : "w-full";

	return (
		<div className={wrapperClass}>
			<div className="flex items-start justify-between rounded-lg border border-slate-200 px-4 py-3">
				<div className="flex w-full items-start justify-between gap-4">
					<div>
						<p className="text-[14px] font-semibold text-slate-700">
							{item.name}
						</p>
						{item.hip ? (
							<p className="mt-1 text-[12px] text-slate-500">{item.hip}</p>
						) : item.code ? (
							<p>{item.code}</p>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
};

export default function DisasterEventReviewStep({
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
			<div className="space-y-5">
				{showHeader ? (
					<div>
						<h3 className="text-[18px] leading-[24px] font-semibold text-slate-800">
							Review and save
						</h3>
						<p className="mt-1 text-[14px] leading-[22px] text-slate-500">
							Verify the information before saving.
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
								Basic information
							</h4>
						</div>
						<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
							{renderReviewItem("Disaster name - national", form.nameNational)}
							{renderReviewItem(
								"Disaster name - global/regional",
								form.nameGlobalOrRegional,
							)}
							{renderReviewItem("National event ID", form.nationalDisasterId)}
							{renderReviewItem("GLIDE number", form.glide)}
							{renderReviewItem("Disaster event UUID", form.id)}
							{renderReviewItem(
								"Recording organisation",
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
								Hazard details
							</h4>
						</div>
						<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
							{renderReviewItem("Hazard type", selectedHazardTypeName)}
							{renderReviewItem("Hazard cluster", selectedHazardClusterName)}
							{renderReviewItem("Specific hazard", selectedSpecificHazardName)}
						</div>
						<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
							{renderReviewItem("Start", startTimingValue)}
							{renderReviewItem("End", endTimingValue)}
						</div>
					</div>
				</Card>

				{renderStep4SectionCard(
					"Location",
					"pi pi-map-marker text-blue-600",
					"No location details available",
					<>
						<div className="space-y-2">
							<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
								Geographic levels
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
									No geographic levels selected
								</p>
							)}
						</div>

						<div className="space-y-2">
							<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
								Spatial footprint
							</p>
							{reviewSpatialFootprintItems.length > 0 ? (
								<ul className="list-disc pl-5 text-[14px] text-slate-500">
									{reviewSpatialFootprintItems.map((title, index) => (
										<li key={`review-footprint-${index}`}>{title}</li>
									))}
								</ul>
							) : (
								<p className="text-[14px] italic text-slate-400">
									No spatial data defined
								</p>
							)}
						</div>

						<ReviewLocationMap
							spatialFootprintData={reviewSpatialFootprintData}
						/>
					</>,
					selectedDivisionItems.length > 0 ||
						reviewSpatialFootprintItems.length > 0,
				)}

				{renderStep4SectionCard(
					"Links",
					"pi pi-link text-blue-600",
					"No links selected",
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
							No links selected
						</p>
					),
					true,
				)}

				{renderStep4SectionCard(
					"Attachments",
					"pi pi-paperclip text-blue-600",
					"No attachments selected",
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
							No attachments selected
						</p>
					),
					true,
				)}

				{renderStep4SectionCard(
					"Linked events",
					"pi pi-link text-blue-600",
					"No linked hazardous or disaster events selected yet",
					<>
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div className="rounded-xl border border-slate-200 bg-white p-4">
								<div className="space-y-3">
									<p className="text-[14px] font-semibold text-slate-700">
										Triggering (causal) hazardous events
									</p>
									<DataView
										className="linked-disaster-event-grid"
										value={triggeringHazardousEventTarget}
										itemTemplate={linkedEventItemTemplate}
										emptyMessage="No linked triggering (causal) hazardous events"
										layout="grid"
									/>
								</div>
							</div>
							<div className="rounded-xl border border-slate-200 bg-white p-4">
								<div className="space-y-3">
									<p className="text-[14px] font-semibold text-slate-700">
										Triggered (subsequent) hazardous events
									</p>
									<DataView
										className="linked-disaster-event-grid"
										value={triggeredHazardousEventTarget}
										itemTemplate={linkedEventItemTemplate}
										emptyMessage="No linked triggered (subsequent) hazardous events"
										layout="grid"
									/>
								</div>
							</div>
						</div>
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div className="rounded-xl border border-slate-200 bg-white p-4">
								<div className="space-y-3">
									<p className="text-[14px] font-semibold text-slate-700">
										Triggering (causal) disaster events
									</p>
									<DataView
										className="linked-disaster-event-grid"
										value={triggeringDisasterEventTarget}
										itemTemplate={linkedEventItemTemplate}
										emptyMessage="No linked triggering (causal) disaster events"
										layout="grid"
									/>
								</div>
							</div>
							<div className="rounded-xl border border-slate-200 bg-white p-4">
								<div className="space-y-3">
									<p className="text-[14px] font-semibold text-slate-700">
										Triggered (subsequent) disaster events
									</p>
									<DataView
										className="linked-disaster-event-grid"
										value={triggeredDisasterEventTarget}
										itemTemplate={linkedEventItemTemplate}
										emptyMessage="No linked triggered (subsequent) disaster events"
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
					"Linked disaster records",
					"pi pi-file text-blue-600",
					"No disaster records linked yet",
					<DataView
						className="linked-disaster-records-grid"
						value={linkedDisasterRecordTarget}
						itemTemplate={linkedEventItemTemplate}
						layout="grid"
					/>,
					linkedDisasterRecordTarget.length > 0,
				)}

				{renderStep4SectionCard(
					"Responses",
					"pi pi-file-edit text-blue-600",
					"No responses recorded yet",
					responses.map((item) =>
						renderStep4DetailRow(
							"response",
							item,
							getDetailTypeLabel,
							getDetailDescriptionValue,
						),
					),
					responses.length > 0,
				)}

				{renderStep4SectionCard(
					"Assessments",
					"pi pi-clipboard text-violet-600",
					"No assessments recorded yet",
					assessments.map((item) =>
						renderStep4DetailRow(
							"assessment",
							item,
							getDetailTypeLabel,
							getDetailDescriptionValue,
						),
					),
					assessments.length > 0,
				)}

				{renderStep4SectionCard(
					"Official declarations",
					"pi pi-send text-amber-600",
					"No declarations recorded yet",
					declarations.map((item) =>
						renderStep4DetailRow(
							"declaration",
							item,
							getDetailTypeLabel,
							getDetailDescriptionValue,
						),
					),
					declarations.length > 0,
				)}
			</div>

			{showActions ? (
				<>
					<div className="col-span-12 mt-30 mb-6 h-[2px] w-full bg-slate-200" />

					<div className="flex items-center justify-between w-full">
						<Button type="button" label="Cancel" outlined onClick={onCancel} />
						<div className="flex gap-2">
							<Button
								type="button"
								label="Back"
								outlined
								icon="pi pi-chevron-left"
								iconPos="left"
								onClick={onBack}
							/>
							<Button
								type="button"
								label="Send for validation"
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
