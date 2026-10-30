import type { InjectionToken } from "@nestjs/common";

import type { INotificationPort } from "~/domains/validation-workflow/application/ports/INotificationPort";

// Same rationale as WorkflowRepositoryToken.ts (design.md Decision 1).
export const NOTIFICATION_PORT: InjectionToken<INotificationPort> =
	Symbol("NOTIFICATION_PORT");
