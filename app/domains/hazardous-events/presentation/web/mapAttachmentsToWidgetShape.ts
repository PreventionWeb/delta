import type { HazardousEventAttachmentProps } from "~/domains/hazardous-events/domain/HazardousEvent";
import { HAZARDOUS_EVENT_UPLOAD_PATH } from "~/utils/paths";

/** The widget's own native item shape (`attachmentsFormView.tsx`) -- not
 * `HazardousEventAttachmentProps`. Feeding the domain shape straight into `initialData` renders
 * every attachment as "N/A" and leaves the edit dialog blank. */
export interface AttachmentWidgetItem {
	id: string;
	title: string;
	tag: ReadonlyArray<{ id: string; name: string }> | null;
	file_option: "File" | "Link";
	file?: { name: string; tenantPath: string; content_type: string };
	url?: string;
}

/**
 * Reverse of `parseHazardousEventFormData.server.ts`'s attachment parsing -- maps a
 * HazardousEvent's persisted attachments back into the shape `AttachmentsFormView` renders and
 * resubmits. `file.name`'s path (no `/temp/` segment) is what the parser's "existing, already
 * promoted" detection relies on -- see `resolveAttachmentsForWrite.ts`.
 */
export function mapAttachmentsToWidgetShape(
	attachments: readonly HazardousEventAttachmentProps[],
	context: { tenantId: string; hazardousEventId: string },
): readonly AttachmentWidgetItem[] {
	const tenantPath = `uploads/tenant-${context.tenantId}`;

	return attachments.map((attachment) => {
		if (attachment.type === "Link") {
			return {
				id: attachment.id,
				title: attachment.title,
				tag: attachment.tag,
				file_option: "Link",
				url: attachment.url ?? "",
			};
		}

		return {
			id: attachment.id,
			title: attachment.title,
			tag: attachment.tag,
			file_option: "File",
			file: {
				name: `${tenantPath}/${HAZARDOUS_EVENT_UPLOAD_PATH.replace(/^uploads\//, "")}/${context.hazardousEventId}/${attachment.fileKey}`,
				tenantPath,
				content_type: attachment.fileType ?? "",
			},
		};
	});
}
