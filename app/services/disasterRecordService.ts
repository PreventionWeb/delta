import {
	disasterRecordsById,
	disasterRecordsUpdateApprovalStatusOnGoing,
	disasterRecordsUpdateApprovalStatusNeedRevision,
	disasterRecordsUpdateApprovalStatusValidate,
	disasterRecordsUpdateApprovalStatusPublish,
} from "~/backend.server/models/disaster_record";
import { approvalStatusIds } from "~/frontend/approval";
import { BackendContext } from "~/backend.server/context";
import { entityValidationAssignmentDeleteByEntityId } from "~/backend.server/models/entity_validation_assignment";
import { dr } from "~/db.server";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { disasterRecordsTable } from "~/drizzle/schema/disasterRecordsTable";
import { and, eq, inArray, ne } from "drizzle-orm";

async function isEventApproved(eventId: string, countryAccountsId: string) {
	const rows = await dr
		.select({ id: disasterEventTable.id })
		.from(disasterEventTable)
		.where(
			and(
				eq(disasterEventTable.id, eventId),
				eq(disasterEventTable.countryAccountsId, countryAccountsId),
				inArray(disasterEventTable.approvalStatus, ["validated", "published"]),
			),
		)
		.limit(1);

	return rows.length > 0;
}

async function hasOtherApprovedRecordsForEvent(
	recordId: string,
	eventId: string,
	countryAccountsId: string,
) {
	const rows = await dr
		.select({ id: disasterRecordsTable.id })
		.from(disasterRecordsTable)
		.where(
			and(
				eq(disasterRecordsTable.disasterEventId, eventId),
				eq(disasterRecordsTable.countryAccountsId, countryAccountsId),
				inArray(disasterRecordsTable.approvalStatus, [
					"validated",
					"published",
				]),
				ne(disasterRecordsTable.id, recordId),
			),
		)
		.limit(1);

	return rows.length > 0;
}

export async function updateDisasterRecordStatusService({
	ctx,
	id,
	approvalStatus,
	countryAccountsId,
	userId,
}: {
	ctx: BackendContext;
	id: string;
	approvalStatus: approvalStatusIds;
	countryAccountsId: string;
	userId: string;
}) {
	const record = await disasterRecordsById(id, countryAccountsId);
	if (!record) {
		return {
			ok: false,
			message: ctx.t({
				code: "common_err_msg.record_not_found",
				msg: "Record not found",
			}),
		};
	}

	// Authorization: user can update
	if (record.countryAccountsId !== countryAccountsId) {
		return {
			ok: false,
			message: ctx.t({
				code: "common_err_msg.not_allowed_to_update_record",
				msg: "You are not allowed to update this record",
			}),
		};
	}

	if (
		record.approvalStatus === "validated" ||
		record.approvalStatus === "published"
	) {
		const recordDisasterEventId = record.disasterEventId;
		const nextStatusMovesAwayFromApproval =
			approvalStatus !== "validated" && approvalStatus !== "published";
		if (
			recordDisasterEventId &&
			nextStatusMovesAwayFromApproval &&
			(await isEventApproved(recordDisasterEventId, countryAccountsId)) &&
			!(await hasOtherApprovedRecordsForEvent(
				id,
				recordDisasterEventId,
				countryAccountsId,
			))
		) {
			return {
				ok: false,
				message: ctx.t({
					code: "common_err_msg.record_requires_linked_event",
					msg: "This is the only published or validated disaster record linked to a validated or published disaster event. It cannot be returned for edit.",
				}),
			};
		}
	}

	if (
		approvalStatus !== "validated" &&
		approvalStatus !== "published" &&
		approvalStatus !== "needs-revision"
	) {
		await disasterRecordsUpdateApprovalStatusOnGoing(id, approvalStatus);
	} else if (approvalStatus === "needs-revision") {
		await disasterRecordsUpdateApprovalStatusNeedRevision(id);
	} else if (approvalStatus === "validated") {
		await disasterRecordsUpdateApprovalStatusValidate(id, userId);
		await entityValidationAssignmentDeleteByEntityId(id, "disaster_records");
	} else if (approvalStatus === "published") {
		await disasterRecordsUpdateApprovalStatusPublish(id, userId);
		await entityValidationAssignmentDeleteByEntityId(id, "disaster_records");
	}

	return {
		ok: true,
		message: ctx.t({
			code: "common.successfully_updated",
			msg: "Successfully updated",
		}),
	};
}
