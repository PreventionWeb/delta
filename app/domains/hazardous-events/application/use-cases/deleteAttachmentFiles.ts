import type { IAttachmentStoragePort } from "~/domains/shared/attachments/application/ports/IAttachmentStoragePort";
import type { ILogger } from "~/shared/logging/ILogger";

/** The shared attachments port's `ownerType` for every HE attachment -- one named constant for
 * Create/Update/DeleteHazardousEvent.ts and resolveAttachmentsForWrite.ts, not a string literal
 * repeated in each (Gate 4 anti-pattern finding). */
export const HAZARDOUS_EVENT_ATTACHMENT_OWNER_TYPE = "hazardous-event";

/**
 * Deletes each fileKey's on-disk file via the shared port -- shared by Update/Delete so the
 * descriptor-building and loop aren't duplicated (Gate 5/SOLID finding).
 *
 * Per-file failures are logged and swallowed, never thrown (Gate 8 finding; Decision 7
 * addendum): unlike `promote()`, a rolled-back `delete()` can't be undone, so letting one
 * propagate would restore the row while the file stays deleted. Swallowing it instead leaves at
 * worst one orphaned file -- the same harmless outcome already accepted for `promote()`.
 */
export async function deleteAttachmentFiles(
	storagePort: Pick<IAttachmentStoragePort, "delete">,
	logger: Pick<ILogger, "error">,
	tenantId: string,
	ownerId: string,
	fileKeys: readonly string[],
): Promise<void> {
	for (const fileKey of fileKeys) {
		try {
			await storagePort.delete(
				{ tenantId, ownerType: HAZARDOUS_EVENT_ATTACHMENT_OWNER_TYPE, ownerId },
				fileKey,
			);
		} catch (err) {
			logger.error({
				msg: "hazardous_event_attachment.delete_failed",
				tenantId,
				ownerId,
				fileKey,
				err,
			});
		}
	}
}
