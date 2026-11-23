import type { HazardousEventAttachmentProps } from "~/domains/hazardous-events/domain/HazardousEvent";

export interface AttachmentLink {
	href: string | undefined;
	label: string;
}

/** Defense in depth for a user-entered attachment URL (design.md Decision 15, Fix 6): accepts
 * only http(s), returning the original string unchanged (not `URL`'s own normalized form). */
function safeLinkHref(url: string): string | undefined {
	try {
		const protocol = new URL(url).protocol.toLowerCase();
		return protocol === "http:" || protocol === "https:" ? url : undefined;
	} catch {
		return undefined;
	}
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
	return {
		href: safeLinkHref(attachment.url ?? ""),
		label: attachment.url ?? "",
	};
}
