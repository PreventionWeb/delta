import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";

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
}
