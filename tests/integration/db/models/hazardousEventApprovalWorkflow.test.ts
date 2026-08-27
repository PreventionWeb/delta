// Phase 0c characterization tests — see hazardous-events-phase0-audit-findings.md before "fixing" any failure here.
import "../setup";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { eq } from "drizzle-orm";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { entityValidationAssignmentTable } from "../testSchema/entityValidationAssignmentTable";
import {
	hazardousEventUpdateApprovalStatusOnGoing,
	hazardousEventUpdateApprovalStatusNeedRevision,
	hazardousEventUpdateApprovalStatusValidate,
	hazardousEventUpdateApprovalStatusPublish,
} from "~/backend.server/models/event/hazardous_event_approval";
import { processValidationAssignmentWorkflow } from "~/backend.server/models/event/validation_workflow";
import { ctx, seedUser, seedHazardousEvent } from "./hazardousEventTestHelpers";

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
		await processValidationAssignmentWorkflow(
			ctx,
			dr as any,
			record.id,
			[userId],
			userId,
			{},
		);

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

describe("processValidationAssignmentWorkflow()", () => {
	it("assigns validators, moves the record to waiting-for-validation, and stamps submittedBy/At", async () => {
		const record = await seedHazardousEvent();
		const validatorA = await seedUser();
		const validatorB = await seedUser();
		const submitter = await seedUser();

		await processValidationAssignmentWorkflow(
			ctx,
			dr as any,
			record.id,
			[validatorA, validatorB],
			submitter,
			{},
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

	it("BUG: the falsy-submittedByUserId email-skip guard is unreachable — the unconditional DB write crashes first on an empty string", async () => {
		const record = await seedHazardousEvent();
		const validator = await seedUser();
		await expect(
			processValidationAssignmentWorkflow(
				ctx,
				dr as any,
				record.id,
				[validator],
				"",
				{},
			),
		).rejects.toThrow(); // see audit findings doc — not reachable with the intended empty-submitter case
	});
});
