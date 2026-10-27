import { useTranslation } from "react-i18next";
import type { HazardousEventDetailDto } from "~/domains/hazardous-events/application/dto/HazardousEventDetailDto";
import type { PageProps } from "~/frontend/page-props";
import { useViewContext } from "~/frontend/context";
// formatDate, not formatDateDisplay -- legacy's detail view uses raw ISO dates (Gate 9 finding).
import { formatDate } from "~/utils/date";
import { Link } from "~/design-system/components/Link";
import { workflowStatusDisplay } from "./workflowStatusDisplay";
import { hazardLabel } from "./hazardLabel";

/** Legacy shows "-" for an empty field value; the DTO carries "" for an unset string field. */
function orDash(value: string): string {
	return value === "" ? "-" : value;
}

/** Field order/bold pattern and the two headings' styling are deliberate choices, not a literal
 * legacy transcription -- see design.md Decision 7/9 for the full rationale. */
export function HazardousEventDetailPage({
	data,
}: PageProps<HazardousEventDetailDto>) {
	const ctx = useViewContext();
	const { t } = useTranslation("hazardous-events");
	const status = workflowStatusDisplay(data.workflowStatus);
	const hazard = hazardLabel(data);

	return (
		<form className="dts-form">
			{/* Only way back to the list — the route is absent from every nav component (Invariant 2). */}
			<p>
				<Link href={ctx.url("/he-preview")}>{t("title")}</Link>
			</p>
			{/* mt-[0.86rem]: Tailwind utility, reusing dts-heading-5's own margin scale for the gap
			 * above it -- human decision: unified heading treatment, not legacy's own inconsistent
			 * bare h2/h5. */}
			<h5 className="dts-heading-5 mt-[0.86rem]">{t("title")}</h5>
			{/* mb-[0.86rem]: Tailwind utility separating this group (heading + ID) from the next --
			 * new structural grouping, no legacy precedent. */}
			<p className="mb-[0.86rem]">
				{t("detail.id_label")}: {data.id}
			</p>
			<h5 className="dts-heading-5">{t("detail.classification.heading")}</h5>
			<p>
				{t("detail.classification.type")}: {data.hazardTypeName ?? "—"}
			</p>
			<p>
				{t("detail.classification.cluster")}: {data.hazardClusterName ?? "—"}
			</p>
			<p className="mb-[0.86rem]">
				{t("detail.classification.hazard")}:{" "}
				{hazard.isFallback ? (
					<span
						style={{ fontFamily: "monospace", color: "#666" }}
						title={t("list.columns.hazard_id_fallback_title")}
					>
						{hazard.text}
					</span>
				) : (
					hazard.text
				)}
			</p>
			<p>
				<strong>{t("list.columns.record_status")}:</strong>{" "}
				<span
					className={status.className}
					style={status.style}
					title={t(`status.${status.labelKey}`)}
				/>{" "}
				{t(`status.${status.labelKey}`)}
			</p>
			<p>
				<strong>{t("detail.fields.national_specification")}:</strong>{" "}
				{orDash(data.nationalSpecification)}
			</p>
			{/* mg-grid mg-grid__col-3: legacy's own fixed-width 3-column grid producing the real gap
			 * between these two fields -- not approximable with ad hoc flex/margin spacing. */}
			<div className="mg-grid mg-grid__col-3">
				<p>
					<strong>{t("detail.fields.start_date")}:</strong>{" "}
					{formatDate(data.startDate)}
				</p>
				<p>
					<strong>{t("detail.fields.end_date")}:</strong>{" "}
					{orDash(formatDate(data.endDate))}
				</p>
			</div>
			<p>
				<strong>{t("detail.fields.description")}:</strong>{" "}
				{orDash(data.description)}
			</p>
			<p>
				<strong>{t("detail.fields.chains_explanation")}:</strong>{" "}
				{orDash(data.chainsExplanation)}
			</p>
			<p>
				<strong>{t("detail.fields.magnitude")}:</strong>{" "}
				{orDash(data.magnitude)}
			</p>
			<p>
				<strong>{t("detail.fields.spatial_footprint")}:</strong>
			</p>
			{data.currentSpatialObservation === null ? (
				<p>{t("detail.spatial_observation.none")}</p>
			) : (
				<>
					<p>
						{t("detail.spatial_observation.observation_time")}:{" "}
						{formatDate(data.currentSpatialObservation.observationTime)}
					</p>
					<p>
						{t("detail.spatial_observation.note")}:{" "}
						{data.currentSpatialObservation.note ?? "—"}
					</p>
				</>
			)}
			<p>
				<strong>{t("detail.fields.attachments")}:</strong>
			</p>
			{data.attachments.length === 0 ? (
				<p>{t("detail.attachments_none")}</p>
			) : (
				<ul>
					{data.attachments.map((attachment) => (
						<li key={attachment.id}>{attachment.title}</li>
					))}
				</ul>
			)}
			<p>
				<strong>{t("detail.fields.record_originator")}:</strong>{" "}
				{orDash(data.recordOriginator)}
			</p>
			<p>
				<strong>{t("detail.fields.hazardous_event_status")}:</strong>{" "}
				{data.hazardousEventStatus
					? t(
							`detail.hazardous_event_status_values.${data.hazardousEventStatus}`,
						)
					: "—"}
			</p>
			<p>
				<strong>{t("detail.fields.data_source")}:</strong>{" "}
				{orDash(data.dataSource)}
			</p>
			<p>
				{t("detail.fields.created_at")}: {formatDate(data.createdAt)}
			</p>
			<p>
				{t("detail.fields.updated_at")}: {formatDate(data.updatedAt)}
			</p>
		</form>
	);
}
