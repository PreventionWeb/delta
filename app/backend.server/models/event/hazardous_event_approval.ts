import { UpdateResult } from "~/backend.server/handlers/form/form";
import { hazardousEventTable } from "~/drizzle/schema/hazardousEventTable";
import { dr } from "~/db.server";
import { eq, sql } from "drizzle-orm";
import { approvalStatusIds } from "~/frontend/approval";
import type { HazardousEventFields } from "./hazardous_event_create_update";

export async function hazardousEventUpdateApprovalStatus(
	id: string,
	status: approvalStatusIds,
): Promise<UpdateResult<HazardousEventFields>> {
	await dr
		.update(hazardousEventTable)
		.set({ approvalStatus: status, updatedAt: sql`CURRENT_TIMESTAMP` })
		.where(eq(hazardousEventTable.id, id))
		.returning();

	return { ok: true };
}

export async function hazardousEventUpdateApprovalStatusOnGoing(
	id: string,
	status: "draft" | "waiting-for-validation" | "needs-revision",
): Promise<UpdateResult<HazardousEventFields>> {
	await dr
		.update(hazardousEventTable)
		.set({
			approvalStatus: status,
			submittedByUserId: null,
			submittedAt: null,
			validatedByUserId: null,
			validatedAt: null,
			publishedByUserId: null,
			publishedAt: null,
			updatedAt: sql`CURRENT_TIMESTAMP`,
		})
		.where(eq(hazardousEventTable.id, id))
		.returning();

	return { ok: true };
}

export async function hazardousEventUpdateApprovalStatusNeedRevision(
	id: string,
): Promise<UpdateResult<HazardousEventFields>> {
	await dr
		.update(hazardousEventTable)
		.set({
			approvalStatus: "needs-revision",
			validatedByUserId: null,
			validatedAt: null,
			publishedByUserId: null,
			publishedAt: null,
			updatedAt: sql`CURRENT_TIMESTAMP`,
		})
		.where(eq(hazardousEventTable.id, id))
		.returning();

	return { ok: true };
}

export async function hazardousEventUpdateApprovalStatusValidate(
	id: string,
	validatedByUserId: string,
): Promise<UpdateResult<HazardousEventFields>> {
	await dr
		.update(hazardousEventTable)
		.set({
			approvalStatus: "validated",
			validatedByUserId: validatedByUserId,
			validatedAt: sql`CURRENT_TIMESTAMP`,
			publishedByUserId: null,
			publishedAt: null,
			updatedAt: sql`CURRENT_TIMESTAMP`,
		})
		.where(eq(hazardousEventTable.id, id))
		.returning();

	return { ok: true };
}

export async function hazardousEventUpdateApprovalStatusPublish(
	id: string,
	publishedByUserId: string,
): Promise<UpdateResult<HazardousEventFields>> {
	await dr
		.update(hazardousEventTable)
		.set({
			approvalStatus: "published",
			validatedByUserId: publishedByUserId,
			validatedAt: sql`CURRENT_TIMESTAMP`,
			publishedByUserId: publishedByUserId,
			publishedAt: sql`CURRENT_TIMESTAMP`,
			updatedAt: sql`CURRENT_TIMESTAMP`,
		})
		.where(eq(hazardousEventTable.id, id))
		.returning();

	return { ok: true };
}


