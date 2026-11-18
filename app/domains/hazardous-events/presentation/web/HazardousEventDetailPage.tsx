import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { HazardousEventDetailDto } from "~/domains/hazardous-events/application/dto/HazardousEventDetailDto";
import type { PageProps } from "~/frontend/page-props";
import { useViewContext } from "~/frontend/context";
// formatDate, not formatDateDisplay -- legacy's detail view uses raw ISO dates (Gate 9 finding).
import { formatDate } from "~/utils/date";
import { Card } from "~/design-system/components/Card";
import { BackLink } from "./BackLink";
import { workflowStatusDisplay } from "./workflowStatusDisplay";
import { hazardLabel } from "./hazardLabel";
import { HazardousEventLocationMap } from "./HazardousEventLocationMap";
import { HazardousEventAttachmentsCard } from "./HazardousEventAttachmentsCard";
import { HazardousEventLinkedEventsCard } from "./HazardousEventLinkedEventsCard";
import { HazardousEventAuditLogCard } from "./HazardousEventAuditLogCard";
import { orDash } from "./orDash";
import { hazardousEventStatusBadgeClassName } from "./hazardousEventStatusBadgeClassName";
import { ReviewField } from "./ReviewField";

/** Inline label/value row; Location Card only. */
function Field({ label, value }: { label: string; value: ReactNode }) {
	return (
		<p>
			<strong>{label}:</strong> {value}
		</p>
	);
}

export function HazardousEventDetailPage({
	data,
}: PageProps<HazardousEventDetailDto>) {
	const ctx = useViewContext();
	const { t } = useTranslation("hazardous-events");
	const status = workflowStatusDisplay(data.workflowStatus);
	const hazard = hazardLabel(data);
	// Not in hazardLabel(): that helper is shared with other pages (design.md Decision 10).
	const hazardText =
		!hazard.isFallback && data.specificHazardCode
			? `${hazard.text} (${data.specificHazardCode})`
			: hazard.text;

	return (
		<form className="dts-form">
			{/* Only way back to the list — the route is absent from every nav component (Invariant 2). */}
			<div className="mb-4">
				<BackLink
					href={ctx.url("/he-preview")}
					label={t("detail.back_to_list")}
				/>
			</div>

			<div className="space-y-6">
				<Card
					title={t("detail.sections.basic_information")}
					icon="pi-info-circle"
					titleSize="sm"
				>
					<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
						<ReviewField
							label={t("detail.fields.record_originator")}
							value={orDash(data.recordOriginator)}
						/>
						<ReviewField
							label={t("detail.fields.hazardous_event_status")}
							value={
								data.hazardousEventStatus ? (
									<span
										className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${hazardousEventStatusBadgeClassName(data.hazardousEventStatus)}`}
									>
										{t(
											`detail.hazardous_event_status_values.${data.hazardousEventStatus}`,
										)}
									</span>
								) : (
									"—"
								)
							}
						/>
						<ReviewField
							label={t("detail.fields.magnitude")}
							value={orDash(data.magnitude)}
						/>
						<ReviewField
							label={t("detail.fields.data_source")}
							value={orDash(data.dataSource)}
						/>
						<ReviewField label={t("detail.fields.uuid")} value={data.id} />
						<ReviewField
							label={t("detail.fields.created_at")}
							value={formatDate(data.createdAt)}
						/>
						<ReviewField
							label={t("detail.fields.updated_at")}
							value={formatDate(data.updatedAt)}
						/>
						<ReviewField
							label={t("list.columns.record_status")}
							value={
								<>
									<span
										className={status.className}
										style={status.style}
										title={t(`status.${status.labelKey}`)}
									/>{" "}
									{t(`status.${status.labelKey}`)}
								</>
							}
						/>
					</div>
				</Card>

				<Card
					title={t("detail.sections.hazard_details")}
					icon="pi-map-marker"
					titleSize="sm"
				>
					<div className="space-y-6">
						<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
							<ReviewField
								label={t("detail.fields.hazard_type")}
								value={data.hazardTypeName ?? "—"}
							/>
							<ReviewField
								label={t("detail.fields.hazard_cluster")}
								value={data.hazardClusterName ?? "—"}
							/>
							<ReviewField
								label={t("detail.fields.specific_hazard")}
								value={
									hazard.isFallback ? (
										<span
											style={{ fontFamily: "monospace", color: "#666" }}
											title={t("list.columns.hazard_id_fallback_title")}
										>
											{hazard.text}
										</span>
									) : (
										hazardText
									)
								}
							/>
						</div>
						<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
							<ReviewField
								label={t("detail.fields.start_date")}
								value={formatDate(data.startDate)}
							/>
							<ReviewField
								label={t("detail.fields.end_date")}
								value={orDash(formatDate(data.endDate))}
							/>
						</div>
						<ReviewField
							label={t("detail.fields.national_specification")}
							value={orDash(data.nationalSpecification)}
							preserveLineBreaks
						/>
						<ReviewField
							label={t("detail.fields.description")}
							value={orDash(data.description)}
							preserveLineBreaks
						/>
						<ReviewField
							label={t("detail.fields.chains_explanation")}
							value={orDash(data.chainsExplanation)}
							preserveLineBreaks
						/>
					</div>
				</Card>

				<Card
					title={t("detail.sections.location")}
					icon="pi-map-marker"
					titleSize="lg"
				>
					{data.currentSpatialObservation === null ? (
						<p>{t("detail.spatial_observation.none")}</p>
					) : (
						<div className="space-y-5">
							<Field
								label={t("detail.spatial_observation.observation_time")}
								value={formatDate(
									data.currentSpatialObservation.observationTime,
								)}
							/>
							<Field
								label={t("detail.spatial_observation.note")}
								value={data.currentSpatialObservation.note ?? "—"}
							/>
							<HazardousEventLocationMap
								geometries={data.currentSpatialObservation.geometries}
								aria-label={t("detail.spatial_observation.map_label")}
							/>
						</div>
					)}
				</Card>

				<HazardousEventAttachmentsCard
					eventId={data.id}
					attachments={data.attachments}
				/>

				<HazardousEventLinkedEventsCard
					cause={data.cause}
					effects={data.effects}
				/>

				<HazardousEventAuditLogCard auditLog={data.auditLog} />
			</div>
		</form>
	);
}
