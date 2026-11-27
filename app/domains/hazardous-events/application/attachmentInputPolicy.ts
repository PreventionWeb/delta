import { ValidationError } from "~/shared/errors";
import type { HazardousEventAttachmentInput } from "./dto/HazardousEventAttachmentInput";

/** Write-time Link allow-list shared by CSV import and the he-preview form (D12, NOD-7); the
 * same predicate as render-time `safeLinkHref` (OWASP: allow-list http and https only). */
export function isAllowedAttachmentUrl(url: string): boolean {
	try {
		const { protocol } = new URL(url);
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
}

/** An attachment's `tag` is `null` or a list of `{ id, name }` string pairs; the detail page
 * renders `name`, so anything else would break it for every viewer. Shared by CSV and form. */
export function isAllowedAttachmentTag(
	tag: unknown,
): tag is ReadonlyArray<{ id: string; name: string }> | null {
	return (
		tag === null ||
		(Array.isArray(tag) &&
			tag.every(
				(item: unknown) =>
					typeof item === "object" &&
					item !== null &&
					typeof (item as { id?: unknown }).id === "string" &&
					typeof (item as { name?: unknown }).name === "string",
			))
	);
}

/** The write-time attachment rules every Create/Update caller gets (D12); adapters may check
 * earlier only to give a friendlier message. */
export function assertAttachmentInputsAllowed(
	inputs: readonly HazardousEventAttachmentInput[] | undefined,
): void {
	for (const input of inputs ?? []) {
		if (!isAllowedAttachmentTag(input.tag)) {
			throw new ValidationError(
				"attachments tags must be a list of id and name strings",
				{ field: "attachments" },
			);
		}
		if (input.kind === "link" && !isAllowedAttachmentUrl(input.url)) {
			throw new ValidationError("attachments links must use http or https", {
				field: "attachments",
			});
		}
	}
}
