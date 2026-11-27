import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";

/** One CA attachment row as the export projection carries it (D9). */
export interface HazardousEventExportAttachment {
	type: "File" | "Link";
	title: string;
	url: string | null;
	tag: ReadonlyArray<{ id: string; name: string }> | null;
	fileKey: string | null;
	fileType: string | null;
}

/** Plain projection read by `findExportRows` (D9); never a rehydrated entity, so unmigrated rows
 * still export. Each `legacy*` field is the fallback used when the CA value is missing (NOD-9). */
export interface HazardousEventExportRow {
	id: string;
	tenantId: string;
	specificHazardId: string | null;
	apiImportId: string | null;
	status: string;
	nationalSpecification: string;
	startDate: string;
	endDate: string;
	description: string;
	chainsExplanation: string;
	magnitude: string;
	recordOriginator: string;
	hazardousEventStatus: string | null;
	dataSource: string;
	specificHazardLocalName: string | null;
	specificHazardNationalName: string | null;
	createdByUserId: string | null;
	updatedByUserId: string | null;
	createdAt: Date;
	updatedAt: Date | null;

	workflowStatus: Status | null;
	workflowSubmittedByUserId: string | null;
	workflowSubmittedAt: Date | null;
	workflowValidatedByUserId: string | null;
	workflowValidatedAt: Date | null;
	workflowPublishedByUserId: string | null;
	workflowPublishedAt: Date | null;

	hazardSourceRefId: string | null;
	clusterSourceRefId: string | null;
	typeSourceRefId: string | null;

	causeId: string | null;
	/** CA cause edges of this event; `causeId` shows only the lowest. */
	causeCount: number;

	legacyApprovalStatus: string;
	legacySubmittedByUserId: string | null;
	legacySubmittedAt: Date | null;
	legacyValidatedByUserId: string | null;
	legacyValidatedAt: Date | null;
	legacyPublishedByUserId: string | null;
	legacyPublishedAt: Date | null;
	legacyHipHazardId: string | null;
	legacyHipClusterId: string | null;
	legacyHipTypeId: string | null;
	legacyParentId: string | null;

	/** Latest CA observation by time, or `null` when the event has none (D9). The time feeds OD-9. */
	currentObservation: {
		observationTime: Date;
		geometries: unknown[];
		divisionIds: string[];
	} | null;
	/** Legacy `hazardous_event_geom` rows as GeoJSON, and `hazardous_event_division` ids (OD-6). */
	legacyGeometries: unknown[];
	legacyDivisionIds: string[];
	/** CA attachment rows; on an unmigrated row `legacyAttachments` (raw jsonb) is exported instead. */
	attachments: HazardousEventExportAttachment[];
	legacyAttachments: unknown;
}
