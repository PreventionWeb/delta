import type { TFunction } from "i18next";

const CREATE_UPDATE_DELETE_HAZARDOUS_EVENT =
	/^(Create|Update|Delete) hazardous event$/;

/** Ports `AuditLogHistory`'s Create/Update/Delete-object translation to this page's own `t()`,
 * now that it no longer renders through `AuditLogHistory` (design.md Decision 15, Fix 8). */
export function translateAuditLogAction(
	action: string,
	t: TFunction<"hazardous-events">,
): string {
	const match = CREATE_UPDATE_DELETE_HAZARDOUS_EVENT.exec(action);
	if (!match) {
		return action;
	}
	const verb = match[1].toLowerCase() as "create" | "update" | "delete";
	return t(`detail.audit_log.actions.${verb}`, {
		obj: t("detail.audit_log.object_hazardous_event"),
	});
}
