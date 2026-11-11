import type { HazardousEventAttachmentProps } from "~/domains/hazardous-events/domain/HazardousEvent";

export interface AttachmentLink {
	href: string;
	label: string;
}

/** File-type: href from `fileKey`, label from `fileName` -- swapped, the download 404s
 * (Decision 9). Link-type: both from `url`. `?? ""` guards the DB check()-excluded null case. */
export function attachmentLink(
	eventId: string,
	attachment: HazardousEventAttachmentProps,
	urlFn: (path: string) => string,
): AttachmentLink {
	if (attachment.type === "File") {
		return {
			href: urlFn(
				`/hazardous-event/file-viewer?name=${encodeURIComponent(eventId)}/${encodeURIComponent(attachment.fileKey ?? "")}`,
			),
			label: attachment.fileName ?? "",
		};
	}
	return { href: attachment.url ?? "", label: attachment.url ?? "" };
}
