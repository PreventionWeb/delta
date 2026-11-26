import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";

/** CA statuses a legacy `approvalStatus` can name; REJECTED has no legacy value (DEF-022). */
export type ImportableStatus = Exclude<Status, "REJECTED">;

const LEGACY_TO_STATUS: ReadonlyMap<string, ImportableStatus> = new Map([
	["", "DRAFT"],
	["draft", "DRAFT"],
	["waiting-for-validation", "SUBMITTED"],
	["needs-revision", "REVISION_REQUESTED"],
	["validated", "APPROVED"],
	["published", "PUBLISHED"],
]);

const STATUS_TO_LEGACY: Readonly<Record<Status, string>> = {
	DRAFT: "draft",
	SUBMITTED: "waiting-for-validation",
	REVISION_REQUESTED: "needs-revision",
	APPROVED: "validated",
	PUBLISHED: "published",
	REJECTED: "",
};

/** D12, import direction: `null` for a value outside the legacy enum. */
export function legacyApprovalStatusToStatus(
	value: string,
): ImportableStatus | null {
	return LEGACY_TO_STATUS.get(value) ?? null;
}

/** D12, export direction: REJECTED is written as an empty cell. */
export function statusToLegacyApprovalStatus(status: Status): string {
	return STATUS_TO_LEGACY[status];
}
