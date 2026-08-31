// Phase 0c characterization tests — see hazardous-events-phase0-audit-findings.md before "fixing" any failure here.
import "../setup";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { eq, sql } from "drizzle-orm";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { entityValidationAssignmentTable } from "../testSchema/entityValidationAssignmentTable";
import {
	hazardousEventUpdateApprovalStatusOnGoing,
	hazardousEventUpdateApprovalStatusNeedRevision,
	hazardousEventUpdateApprovalStatusValidate,
	hazardousEventUpdateApprovalStatusPublish,
} from "~/backend.server/models/event";
import { handleApprovalWorkflowService } from "~/backend.server/services/approvalWorkflowService";
import {
	seedUser,
	seedUserWithCountryAccountRole,
	seedHazardousEvent,
} from "./hazardousEventTestHelpers";

// handleApprovalWorkflowService's internal handlers call ctx.url(), unlike the direct
// hazardous_event_approval.ts functions above which only need ctx.t().
const workflowCtx = {
	t: ({ msg }: { msg: string }) => msg,
	url: (path: string) => path,
} as any;

async function getRecord(id: string) {
	const [row] = await dr
		.select()
		.from(hazardousEventTable)
		.where(eq(hazardousEventTable.id, id));
	return row;
}

describe("hazardousEventUpdateApprovalStatusOnGoing()", () => {
	it("sets the given status and clears submitted/validated/published attribution", async () => {
		const record = await seedHazardousEvent();
		const userId = await seedUser();
		await hazardousEventUpdateApprovalStatusValidate(record.id, userId);

		await hazardousEventUpdateApprovalStatusOnGoing(record.id, "draft");
		const row = await getRecord(record.id);
		expect(row.approvalStatus).toBe("draft");
		expect(row.submittedByUserId).toBeNull();
		expect(row.validatedByUserId).toBeNull();
		expect(row.publishedByUserId).toBeNull();
	});
});

describe("hazardousEventUpdateApprovalStatusNeedRevision()", () => {
	it("sets needs-revision and clears validated/published, but not submitted", async () => {
		const record = await seedHazardousEvent();
		const userId = await seedUser();
		await dr
			.update(hazardousEventTable)
			.set({ submittedByUserId: userId, submittedAt: sql`CURRENT_TIMESTAMP` })
			.where(eq(hazardousEventTable.id, record.id));

		await hazardousEventUpdateApprovalStatusNeedRevision(record.id);
		const row = await getRecord(record.id);
		expect(row.approvalStatus).toBe("needs-revision");
		expect(row.submittedByUserId).toBe(userId); // QUIRK: submitted attribution survives a revision request
		expect(row.validatedByUserId).toBeNull();
	});
});

describe("hazardousEventUpdateApprovalStatusValidate()", () => {
	it("sets validated with the validator's attribution and clears published", async () => {
		const record = await seedHazardousEvent();
		const userId = await seedUser();

		await hazardousEventUpdateApprovalStatusValidate(record.id, userId);
		const row = await getRecord(record.id);
		expect(row.approvalStatus).toBe("validated");
		expect(row.validatedByUserId).toBe(userId);
		expect(row.validatedAt).not.toBeNull();
		expect(row.publishedByUserId).toBeNull();
	});
});

describe("hazardousEventUpdateApprovalStatusPublish()", () => {
	it("BUG: overwrites validatedByUserId/validatedAt with the publisher's own identity, losing the original validator's attribution", async () => {
		const record = await seedHazardousEvent();
		const validator = await seedUser();
		const publisher = await seedUser();

		await hazardousEventUpdateApprovalStatusValidate(record.id, validator);
		const afterValidate = await getRecord(record.id);
		expect(afterValidate.validatedByUserId).toBe(validator);

		await hazardousEventUpdateApprovalStatusPublish(record.id, publisher);
		const afterPublish = await getRecord(record.id);
		expect(afterPublish.approvalStatus).toBe("published");
		expect(afterPublish.publishedByUserId).toBe(publisher);
		// The original validator's id is gone — see audit findings doc.
		expect(afterPublish.validatedByUserId).toBe(publisher);
		expect(afterPublish.validatedAt).not.toEqual(afterValidate.validatedAt);
	});
});

// handleApprovalWorkflowService is the LIVE "submit for validation" path — the orphaned
// processValidationAssignmentWorkflow it replaces is dead code, see audit findings doc.
describe("handleApprovalWorkflowService() — submit-validation (live path)", () => {
	it("assigns validators, moves the record to waiting-for-validation, and stamps submittedBy/At", async () => {
		const record = await seedHazardousEvent();
		const submitter = await seedUserWithCountryAccountRole(
			record.countryAccountsId,
		);
		const validatorA = await seedUser();
		const validatorB = await seedUser();

		// Not wrapped in dr.transaction() — see audit findings doc (deadlocks PGlite's single connection).
		await handleApprovalWorkflowService(
			workflowCtx,
			dr as any,
			record.id,
			"hazardous_event",
			{
				updatedByUserId: submitter,
				countryAccountsId: record.countryAccountsId,
				tempAction: "submit-validation",
				tempValidatorUserIds: `${validatorA},${validatorB}`,
			},
		);

		const row = await getRecord(record.id);
		expect(row.approvalStatus).toBe("waiting-for-validation");
		expect(row.submittedByUserId).toBe(submitter);
		expect(row.submittedAt).not.toBeNull();

		const assignments = await dr
			.select()
			.from(entityValidationAssignmentTable)
			.where(eq(entityValidationAssignmentTable.entityId, record.id));
		expect(assignments).toHaveLength(2);
		expect(assignments.map((a) => a.assignedToUserId).sort()).toEqual(
			[validatorA, validatorB].sort(),
		);
	});

	it("is a silent no-op when the record isn't in draft/needs-revision (e.g. already waiting-for-validation)", async () => {
		const record = await seedHazardousEvent();
		const submitter = await seedUserWithCountryAccountRole(
			record.countryAccountsId,
		);
		await dr
			.update(hazardousEventTable)
			.set({ approvalStatus: "waiting-for-validation" })
			.where(eq(hazardousEventTable.id, record.id));
		const anotherValidator = await seedUser();

		await handleApprovalWorkflowService(
			workflowCtx,
			dr as any,
			record.id,
			"hazardous_event",
			{
				updatedByUserId: submitter,
				countryAccountsId: record.countryAccountsId,
				tempAction: "submit-validation",
				tempValidatorUserIds: anotherValidator,
			},
		);

		const row = await getRecord(record.id);
		expect(row.approvalStatus).toBe("waiting-for-validation"); // unchanged, no error either
	});
});

describe("handleApprovalWorkflowService() — submit-publish (live path)", () => {
	it("BUG (same as the detail-page path): also overwrites validatedByUserId/validatedAt with the publisher's identity", async () => {
		const record = await seedHazardousEvent();
		const validator = await seedUser();
		const publisher = await seedUserWithCountryAccountRole(
			record.countryAccountsId,
			"admin", // required role, per the shouldProcess gate
		);
		// shouldProcess only allows submit-publish from draft/needs-revision, not "validated" —
		// so simulate validatedByUserId already set while status is still draft (see doc).
		await dr
			.update(hazardousEventTable)
			.set({
				validatedByUserId: validator,
				validatedAt: sql`CURRENT_TIMESTAMP`,
			})
			.where(eq(hazardousEventTable.id, record.id));

		await handleApprovalWorkflowService(
			workflowCtx,
			dr as any,
			record.id,
			"hazardous_event",
			{
				updatedByUserId: publisher,
				countryAccountsId: record.countryAccountsId,
				tempAction: "submit-publish",
			},
		);

		const row = await getRecord(record.id);
		expect(row.approvalStatus).toBe("published");
		expect(row.validatedByUserId).toBe(publisher); // the original validator's id is gone here too
	});
});
