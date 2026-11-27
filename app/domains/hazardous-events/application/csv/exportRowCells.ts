import type { HazardousEventExportRow } from "../dto/HazardousEventExportRow";
import { statusToLegacyApprovalStatus } from "./approvalStatusMapping";
import { EXPORT_HEADER } from "./hazardousEventCsvColumns";
import { formatSpatialFootprintCell } from "./spatialFootprintCsv";
import {
	formatAttachmentsCell,
	formatLegacyAttachmentsCell,
} from "./attachmentsCsv";

function timestampCell(value: Date | null): string {
	return value === null ? "" : value.toISOString();
}

/** Uses the WorkflowInstance pair when one exists, else the legacy columns (NOD-9). */
function attributionCells(row: HazardousEventExportRow) {
	const hasWorkflow = row.workflowStatus !== null;
	return {
		submittedByUserId: hasWorkflow
			? row.workflowSubmittedByUserId
			: row.legacySubmittedByUserId,
		submittedAt: hasWorkflow ? row.workflowSubmittedAt : row.legacySubmittedAt,
		validatedByUserId: hasWorkflow
			? row.workflowValidatedByUserId
			: row.legacyValidatedByUserId,
		validatedAt: hasWorkflow ? row.workflowValidatedAt : row.legacyValidatedAt,
		publishedByUserId: hasWorkflow
			? row.workflowPublishedByUserId
			: row.legacyPublishedByUserId,
		publishedAt: hasWorkflow ? row.workflowPublishedAt : row.legacyPublishedAt,
	};
}

/** Export cells by column (D9), unguarded (the serializer guards, D8). The import's unchanged
 * check compares against these, so both sides format alike (NOD-4). */
export function exportRowCells(
	row: HazardousEventExportRow,
): Readonly<Record<string, string>> {
	const attribution = attributionCells(row);
	const hasHazard = row.specificHazardId !== null;
	return {
		updatedAt: timestampCell(row.updatedAt),
		createdAt: timestampCell(row.createdAt),
		approvalStatus:
			row.workflowStatus !== null
				? statusToLegacyApprovalStatus(row.workflowStatus)
				: row.legacyApprovalStatus,
		createdByUserId: row.createdByUserId ?? "",
		updatedByUserId: row.updatedByUserId ?? "",
		submittedByUserId: attribution.submittedByUserId ?? "",
		submittedAt: timestampCell(attribution.submittedAt),
		validatedByUserId: attribution.validatedByUserId ?? "",
		validatedAt: timestampCell(attribution.validatedAt),
		publishedByUserId: attribution.publishedByUserId ?? "",
		publishedAt: timestampCell(attribution.publishedAt),
		apiImportId: row.apiImportId ?? "",
		hipHazardId:
			(hasHazard ? row.hazardSourceRefId : row.legacyHipHazardId) ?? "",
		hipClusterId:
			(hasHazard ? row.clusterSourceRefId : row.legacyHipClusterId) ?? "",
		hipTypeId: (hasHazard ? row.typeSourceRefId : row.legacyHipTypeId) ?? "",
		id: row.id,
		countryAccountsId: row.tenantId,
		specificHazardId: row.specificHazardId ?? "",
		status: row.status,
		nationalSpecification: row.nationalSpecification,
		startDate: row.startDate,
		endDate: row.endDate,
		description: row.description,
		chainsExplanation: row.chainsExplanation,
		magnitude: row.magnitude,
		recordOriginator: row.recordOriginator,
		hazardousEventStatus: row.hazardousEventStatus ?? "",
		dataSource: row.dataSource,
		specificHazardLocalName: row.specificHazardLocalName ?? "",
		specificHazardNationalName: row.specificHazardNationalName ?? "",
		// Only unmigrated rows fall back: on a migrated row no CA cause means it was cleared (NOD-9).
		parent: row.causeId ?? (hasHazard ? null : row.legacyParentId) ?? "",
		spatialFootprint: footprintCell(row),
		// Only unmigrated rows fall back to the legacy jsonb (OD-6).
		attachments: hasHazard
			? formatAttachmentsCell(row.attachments, {
					tenantId: row.tenantId,
					eventId: row.id,
				})
			: formatLegacyAttachmentsCell(row.legacyAttachments),
	};
}

/** A recorded empty observation exports `[]`; legacy rows only stand in when there is none (OD-6). */
function footprintCell(row: HazardousEventExportRow): string {
	const observation = row.currentObservation;
	return observation !== null
		? formatSpatialFootprintCell(
				observation.geometries,
				observation.divisionIds,
			)
		: formatSpatialFootprintCell(row.legacyGeometries, row.legacyDivisionIds);
}

/** One export record in `EXPORT_HEADER` order. */
export function exportRowValues(row: HazardousEventExportRow): string[] {
	const cells = exportRowCells(row);
	return EXPORT_HEADER.map((column) => cells[column]);
}
