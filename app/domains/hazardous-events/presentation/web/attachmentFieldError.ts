import type { HazardousEventAttachmentInput } from "../../application/dto/HazardousEventAttachmentInput";
import {
	isAllowedAttachmentTag,
	isAllowedAttachmentUrl,
} from "../../application/attachmentInputPolicy";

const URL_ERROR_KEY = "hazardous-events:form.attachments_invalid_url";
const TAG_ERROR_KEY = "hazardous-events:form.attachments_invalid_tag";

/** The form's translated inline error for the use cases' attachment rules, checked before any
 * write so the user sees field copy instead of a generic error (D12). */
export function attachmentFieldError(
	attachments: readonly HazardousEventAttachmentInput[],
	t: (key: string) => string,
): { attachments: string[] } | null {
	if (attachments.some((item) => !isAllowedAttachmentTag(item.tag))) {
		return { attachments: [t(TAG_ERROR_KEY)] };
	}
	const invalidLink = attachments.some(
		(item) => item.kind === "link" && !isAllowedAttachmentUrl(item.url),
	);
	return invalidLink ? { attachments: [t(URL_ERROR_KEY)] } : null;
}
