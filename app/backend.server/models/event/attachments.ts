
import { ContentRepeaterUploadFile } from "~/components/ContentRepeater/UploadFile";
import { TEMP_UPLOAD_PATH } from "~/utils/paths";
import { eq } from "drizzle-orm";
import type { Tx } from "~/db.server";

export async function processAndSaveAttachments(
	tableObj: any,
	tx: Tx,
	resourceId: string,
	attachmentsData: any[],
	directory: string,
	countryAccountsId?: string | null,
) {
	if (!attachmentsData) return;
	if (!countryAccountsId && attachmentsData.length === 0) return;

	const save_path = `/uploads/${directory}/${resourceId}`;
	const save_path_temp = TEMP_UPLOAD_PATH;

	// Process the attachments data
	const processedAttachments = ContentRepeaterUploadFile.save(
		attachmentsData,
		save_path_temp,
		save_path,
		undefined,
		countryAccountsId ?? undefined,
	);

	// Update the `attachments` field in the database
	await tx
		.update(tableObj)
		.set({
			attachments: processedAttachments || [], // Ensure it defaults to an empty array if undefined
		})
		.where(eq(tableObj.id, resourceId));
}

