import type { InjectionToken } from "@nestjs/common";

import type { IAuditLogPort } from "~/domains/shared/audit-log/application/ports/IAuditLogPort";

// Hidden-token convention, same as AttachmentStoragePortToken.ts (design.md Decision 9).
export const AUDIT_LOG_PORT: InjectionToken<IAuditLogPort> =
	Symbol("AUDIT_LOG_PORT");
