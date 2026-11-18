// Left verbatim so presentation/web/translateAuditLogAction's own switch still applies.
const KNOWN_TRANSLATABLE_PREFIX = /^(Create|Update|Delete)\s/;

/** Read-side-only fallback for audit action strings translateAuditLogAction doesn't recognize
 * (e.g. "submit-draft", "delete"); never touches the write-side action value. */
export function humanizeAuditAction(action: string): string {
	if (KNOWN_TRANSLATABLE_PREFIX.test(action)) {
		return action;
	}
	const spaced = action.replace(/-/g, " ");
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
